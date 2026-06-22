const fs     = require("fs");
const path   = require("path");
const http   = require("http");
const https  = require("https");
const { spawn } = require("child_process");
const { WebSocketServer } = require("ws");

// ── Certificados SSL ─────────────────────────────────────────────────────────
// Prioridad: .pem manuales en la raíz del proyecto (modo dev con mkcert).
// Si no hay, se genera (y cachea) un certificado autofirmado para la IP actual,
// así la app empaquetada funciona en cualquier máquina sin depender de mkcert.
function getSSLOptions(certDir) {
  const localFiles = fs.readdirSync(__dirname).filter(f => f.endsWith(".pem"));
  const localCert  = localFiles.find(f => !f.includes("key"));
  const localKey   = localFiles.find(f =>  f.includes("key"));
  if (localCert && localKey) {
    return { cert: fs.readFileSync(path.join(__dirname, localCert)),
             key:  fs.readFileSync(path.join(__dirname, localKey)) };
  }
  return getOrCreateSelfSignedCert(certDir || __dirname);
}

function getOrCreateSelfSignedCert(dir) {
  const certPath = path.join(dir, "scannertate-cert.pem");
  const keyPath  = path.join(dir, "scannertate-key.pem");
  const ip = getLocalIP();

  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    const certText = fs.readFileSync(certPath, "utf8");
    if (certText.includes(`IP:${ip}`)) {
      return { cert: Buffer.from(certText), key: fs.readFileSync(keyPath) };
    }
  }

  const selfsigned = require("selfsigned");
  const pems = selfsigned.generate([{ name: "commonName", value: ip }], {
    days: 3650,
    keySize: 2048,
    extensions: [{
      name: "subjectAltName",
      altNames: [
        { type: 2, value: "localhost" },
        { type: 7, ip: "127.0.0.1" },
        { type: 7, ip },
      ],
    }],
  });

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(certPath, pems.cert);
  fs.writeFileSync(keyPath, pems.private);
  return { cert: Buffer.from(pems.cert), key: Buffer.from(pems.private) };
}

// ── Copiar al portapapeles + auto-pegado ─────────────────────────────────────
function run(cmd, args, input) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args);
    if (input != null) { proc.stdin.write(input, "utf8"); proc.stdin.end(); }
    proc.on("close", code => code === 0 ? resolve() : reject(new Error(`${cmd} salió con código ${code}`)));
    proc.on("error", reject);
  });
}

function copyToClipboard(text) {
  const platform = process.platform;
  if (platform === "darwin") return run("pbcopy", [], text);
  if (platform === "win32")  return run("clip", [], text);
  return run("xclip", ["-selection", "clipboard"], text);
}

function escapeAppleScriptString(text) {
  return text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function escapeSendKeys(text) {
  return text.replace(/([+^%~(){}[\]])/g, "{$1}").replace(/'/g, "''");
}

// Solo ASCII imprimible: lo que cubre la inmensa mayoría de códigos de barras
// (numéricos/alfanuméricos). Para eso se puede "tipear" directo, sin pasar
// por el portapapeles.
const ASCII_SAFE = /^[\x20-\x7E]*$/;

// Inserta el texto donde esté el foco/cursor y, si pressEnter, presiona Return.
//
// Si el texto es ASCII simple, se TIPEA directo con keystroke/SendKeys en vez
// de copiar+pegar. Motivo: pegar (Cmd+V/Ctrl+V) dispara en apps web como
// Google Sheets una lectura async del portapapeles (Clipboard API) antes de
// que la celda quede realmente editable — si el Enter llega mientras esa
// lectura todavía no terminó, se pierde, y el siguiente escaneo termina
// pegado en la misma celda. Tipeando los caracteres se usa el mismo camino
// que un teclado real, sin ese paso async, así el timing es confiable.
//
// Para texto con caracteres no-ASCII (unicode raro en QR) se cae al paste
// tradicional, porque keystroke/SendKeys no son confiables con unicode.
// Requiere permiso de Accesibilidad en Mac la primera vez.
function insertText(text, pressEnter) {
  const platform = process.platform;
  const safe = ASCII_SAFE.test(text);

  if (platform === "darwin") {
    const args = safe
      ? ["-e", `tell application "System Events" to keystroke "${escapeAppleScriptString(text)}"`]
      : ["-e", 'tell application "System Events" to keystroke "v" using {command down}'];
    if (pressEnter) {
      args.push("-e", `delay ${safe ? "0.15" : "0.4"}`, "-e", 'tell application "System Events" to key code 36');
    }
    return run("osascript", args);
  }

  if (platform === "win32") {
    let ps = safe
      ? `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${escapeSendKeys(text)}')`
      : "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')";
    if (pressEnter) {
      ps += `; Start-Sleep -Milliseconds ${safe ? "150" : "400"}; [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')`;
    }
    return run("powershell", ["-NoProfile", "-NonInteractive", "-Command", ps]);
  }

  return Promise.resolve(); // Linux: no implementado, queda solo en el portapapeles
}

// ── Servidor HTTP/S ──────────────────────────────────────────────────────────
const PUBLIC = path.join(__dirname, "public");
const MIME   = { ".html":"text/html", ".css":"text/css", ".js":"application/javascript",
                 ".json":"application/json", ".png":"image/png", ".jpg":"image/jpeg",
                 ".ico":"image/x-icon", ".svg":"image/svg+xml" };

function handler(req, res) {
  let filePath = path.join(PUBLIC, req.url === "/" ? "index.html" : req.url);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end("Not found"); return; }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
}

function getLocalIP() {
  const { networkInterfaces } = require("os");
  for (const iface of Object.values(networkInterfaces())) {
    for (const addr of iface) {
      if (addr.family === "IPv4" && !addr.internal) return addr.address;
    }
  }
  return "localhost";
}

// ── Estado del módulo ────────────────────────────────────────────────────────
let server   = null;
let wss      = null;
let history  = [];
let ssl      = null;
const PORT   = process.env.PORT || 3000;

function isRunning() { return !!server && server.listening; }

function getStatus() {
  const ip    = getLocalIP();
  const proto = ssl ? "https" : "http";
  return {
    running: isRunning(),
    ip, port: PORT, ssl: !!ssl,
    url:      isRunning() ? `${proto}://${ip}:${PORT}` : null,
    adminUrl: isRunning() ? `${proto}://${ip}:${PORT}/admin.html` : null,
  };
}

function start({ certDir } = {}) {
  return new Promise((resolve, reject) => {
    if (isRunning()) return resolve(getStatus());

    ssl    = getSSLOptions(certDir);
    server = ssl ? https.createServer(ssl, handler) : http.createServer(handler);

    wss = new WebSocketServer({ server });
    wss.on("connection", (ws) => {
      ws.send(JSON.stringify({ type: "history", data: history }));
      ws.on("message", async (raw) => {
        let msg; try { msg = JSON.parse(raw); } catch { return; }

        if (msg.type === "scan") {
          const entry = {
            text: msg.text, format: msg.format || "desconocido",
            pressEnter: msg.pressEnter !== false, ts: new Date().toISOString()
          };
          history.unshift(entry);
          if (history.length > 200) history.pop();

          try {
            await copyToClipboard(msg.text);
            entry.status = "ok";
            console.log(`✅ Portapapeles: ${msg.text}${entry.pressEnter ? " + ↵" : ""}`);
            insertText(msg.text, entry.pressEnter)
              .catch(e => console.error(`⚠️  No se pudo auto-pegar/Enter: ${e.message}`));
          } catch (e) {
            entry.status = "error";
            entry.error  = e.message;
            console.error(`❌ Error: ${e.message}`);
          }

          const payload = JSON.stringify({ type: "scanned", data: entry });
          wss.clients.forEach(c => { if (c.readyState === 1) c.send(payload); });
        }

        if (msg.type === "clear_history") {
          history.length = 0;
          wss.clients.forEach(c => {
            if (c.readyState === 1) c.send(JSON.stringify({ type: "history", data: [] }));
          });
        }
      });
    });

    server.once("error", reject);
    server.listen(PORT, "0.0.0.0", () => {
      const status = getStatus();
      console.log(`\n🔥 ScannerTate corriendo ${ssl ? "con HTTPS ✅" : "sin SSL ⚠️"}`);
      console.log(`\n📱 Celular → abrí esta URL:\n   ${status.url}\n`);
      console.log(`🖥  Panel escritorio:\n   ${status.adminUrl}\n`);
      console.log(`💻 Sistema: ${process.platform}`);
      console.log(`📋 Modo: copia + auto-pegado (${process.platform === "darwin" ? "Cmd+V" : "Ctrl+V"})\n`);
      resolve(status);
    });
  });
}

function stop() {
  return new Promise((resolve) => {
    if (!isRunning()) return resolve(getStatus());
    wss.clients.forEach(c => c.terminate());
    server.close(() => {
      server = null; wss = null; ssl = null;
      resolve(getStatus());
    });
  });
}

module.exports = { start, stop, getStatus, getLocalIP, PORT };

// Uso directo por CLI: `node server.js` / npm start
if (require.main === module) {
  start().catch(err => { console.error(err); process.exit(1); });
}
