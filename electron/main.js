const { app, BrowserWindow, ipcMain, Menu, dialog, shell, systemPreferences } = require("electron");
const path = require("path");
const QRCode = require("qrcode");
const serverApp = require("../server.js");

const APP_ICON = path.join(__dirname, "..", "public", "img", "AppIcon-dock.png");

let win = null;
let accessibilityDialogOpen = false;

async function buildStatus() {
  const status = serverApp.getStatus();
  let qr = null;
  if (status.running) {
    qr = await QRCode.toDataURL(status.url, {
      width: 220, margin: 1,
      color: { dark: "#343a40", light: "#ffffff" },
    });
  }
  return { ...status, qr };
}

function pushStatus() {
  if (!win || win.isDestroyed()) return;
  buildStatus().then(status => win.webContents.send("server:status-changed", status));
}

function createWindow() {
  win = new BrowserWindow({
    width: 380,
    height: 600,
    resizable: false,
    maximizable: false,
    title: "ScannerTate",
    backgroundColor: "#f8f9fa",
    icon: APP_ICON,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, "control.html"));
  win.on("focus", checkAccessibility);
}

// ── Permiso de Accesibilidad (Mac) ───────────────────────────────────────────
// Necesario para que osascript pueda simular Cmd+V donde esté el cursor.
function checkAccessibility() {
  if (process.platform !== "darwin" || accessibilityDialogOpen) return;
  const granted = systemPreferences.isTrustedAccessibilityClient(false);
  if (granted) return;

  accessibilityDialogOpen = true;
  dialog.showMessageBox(win, {
    type: "warning",
    title: "Permiso de Accesibilidad necesario",
    message: "ScannerTate necesita permiso de Accesibilidad",
    detail: "Para pegar automáticamente el texto escaneado donde esté el cursor, macOS requiere otorgarle acceso de Accesibilidad a ScannerTate.\n\nAbrí Configuración del Sistema → Privacidad y Seguridad → Accesibilidad, y activá ScannerTate en la lista.",
    buttons: ["Abrir Configuración del Sistema", "Más tarde"],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  }).then(({ response }) => {
    accessibilityDialogOpen = false;
    if (response === 0) {
      shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility");
    }
  });
}

ipcMain.handle("server:start", async () => {
  await serverApp.start({ certDir: app.getPath("userData") });
  const status = await buildStatus();
  pushStatus();
  return status;
});

ipcMain.handle("server:stop", async () => {
  await serverApp.stop();
  const status = await buildStatus();
  pushStatus();
  return status;
});

ipcMain.handle("server:status", () => buildStatus());

app.whenReady().then(() => {
  if (process.platform === "darwin") {
    Menu.setApplicationMenu(null);
    if (app.dock) {
      try { app.dock.setIcon(APP_ICON); }
      catch (err) { console.error("No se pudo aplicar el ícono del dock:", err); }
    }
  }
  createWindow();
  checkAccessibility();
  serverApp.start({ certDir: app.getPath("userData") })
    .then(pushStatus)
    .catch(err => console.error("No se pudo iniciar el servidor:", err));

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    serverApp.stop().finally(() => app.quit());
  }
});

app.on("before-quit", () => {
  serverApp.stop();
});
