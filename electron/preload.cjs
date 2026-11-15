const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("margin", {
  close: () => ipcRenderer.send("window-close"),
  minimize: () => ipcRenderer.send("window-minimize"),
  setBackground: (color) => ipcRenderer.send("window-background", color),
  toggleFullscreen: () => ipcRenderer.send("window-fullscreen"),
  isFullscreen: () => ipcRenderer.invoke("window-is-fullscreen"),
  onFullscreen: (callback) => {
    const listener = (_event, value) => callback(Boolean(value))
    ipcRenderer.on("fullscreen-changed", listener)
    return () => ipcRenderer.removeListener("fullscreen-changed", listener)
  },
})
