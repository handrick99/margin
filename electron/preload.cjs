const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("margin", {
  close: () => ipcRenderer.send("window-close"),
  minimize: () => ipcRenderer.send("window-minimize"),
  setBackground: (color) => ipcRenderer.send("window-background", color),
})
