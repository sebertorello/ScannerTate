const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  start: () => ipcRenderer.invoke("server:start"),
  stop: () => ipcRenderer.invoke("server:stop"),
  status: () => ipcRenderer.invoke("server:status"),
  onStatusChange: (cb) => ipcRenderer.on("server:status-changed", (_e, data) => cb(data)),
});
