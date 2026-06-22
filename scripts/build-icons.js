const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const SRC      = path.join(__dirname, "..", "public", "img", "AppIcon.png");
// Para electron-builder (no se empaqueta en el app, solo se usa al compilar el .icns/.ico).
const OUT_BUILD = path.join(__dirname, "..", "build", "icon.png");
// Para el ícono en vivo del dock/ventana (sí se empaqueta, vive dentro de public/**).
const OUT_DOCK  = path.join(__dirname, "..", "public", "img", "AppIcon-dock.png");
const CANVAS = 512;
const LOGO   = 420;

fs.mkdirSync(path.dirname(OUT_BUILD), { recursive: true });

async function build() {
  const logo = await sharp(SRC)
    .resize(LOGO, LOGO, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  const padded = sharp({
    create: {
      width: CANVAS, height: CANVAS, channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }).composite([{ input: logo, gravity: "center" }]).png();

  await padded.clone().toFile(OUT_BUILD);
  await padded.clone().toFile(OUT_DOCK);

  console.log(`Íconos generados (${CANVAS}x${CANVAS}, logo ${LOGO}x${LOGO}, fondo transparente):`);
  console.log(`  build/icon.png (empaquetado con electron-builder)`);
  console.log(`  public/img/AppIcon-dock.png (dock/ventana en vivo)`);
}

build().catch(err => { console.error(err); process.exit(1); });
