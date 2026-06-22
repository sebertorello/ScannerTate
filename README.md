# ScannerTate 📱→🖥

Escáner de QR y códigos de barra desde el celular a la PC.  
El celular escanea → el texto aparece tipeado donde esté el cursor en tu computadora.

## Requisitos

- Node.js 18+
- Mac o Windows
- Celular en la misma red WiFi que la PC

## Instalación (primera vez)

```bash
git clone https://github.com/sebertorello/ScannerTate.git
cd ScannerTate
npm install
```

### Solo en Mac (permisos de accesibilidad)

nut-js necesita permiso para controlar el teclado:

1. **Preferencias del Sistema → Privacidad y Seguridad → Accesibilidad**
2. Agregar **Terminal** (o el terminal que uses)

### Solo en Windows

Si nut-js falla al instalar, ejecutar como Administrador:

```bash
npm install --ignore-scripts
npm install @nut-tree-fork/nut-js --build-from-source
```

## Uso

```bash
node server.js
```

La consola muestra la URL. Ejemplo:

```
📱 Celular → abrí esta URL:
   http://192.168.1.45:3000

🖥  Panel escritorio:
   http://192.168.1.45:3000/admin.html
```

1. Abrí la URL del celular en el navegador del celu
2. Escaneá cualquier QR o código de barras
3. El texto se tipea automáticamente en tu PC donde esté el cursor

## Archivos

```
ScannerTate/
├── server.js          ← servidor Node (correr esto)
├── public/
│   ├── index.html     ← app del celular
│   └── admin.html     ← panel de escritorio
├── img/
│   └── LogoTate.png   ← logo
└── package.json
```

## Toggle "Enter al escanear"

En el celular podés activar/desactivar si se presiona Enter automáticamente después de cada escaneo.  
Útil para formularios donde cada código va en un campo distinto.
