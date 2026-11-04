const { app, BrowserWindow, ipcMain } = require("electron")
const fs = require("fs")
const path = require("path")

if (process.platform === "linux") {
  app.commandLine.appendSwitch("no-sandbox")
}

app.setName("Margin")

const port = process.env.PORT || "3847"
const boundsPath = () => path.join(app.getPath("userData"), "window.json")

function readBounds() {
  try {
    const saved = JSON.parse(fs.readFileSync(boundsPath(), "utf8"))
    if (Number.isFinite(saved.width) && Number.isFinite(saved.height)) return saved
  } catch {
    // First launch has no saved window.
  }
  return { width: 420, height: 520, x: undefined, y: undefined }
}

function saveBounds(win) {
  if (win.isDestroyed()) return
  fs.mkdirSync(path.dirname(boundsPath()), { recursive: true })
  fs.writeFileSync(boundsPath(), JSON.stringify(win.getBounds()))
}

let win = null

function createWindow() {
  const bounds = readBounds()
  win = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 360,
    minHeight: 460,
    show: false,
    frame: false,
    backgroundColor: "#141414",
    autoHideMenuBar: true,
    alwaysOnTop: true,
    title: "Margin",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  win.removeMenu()
  if (process.platform === "darwin") {
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  }
  win.loadURL(`http://127.0.0.1:${port}/?desktop=1`)
  win.once("ready-to-show", () => win?.show())
  win.on("move", () => win && saveBounds(win))
  win.on("resize", () => win && saveBounds(win))
}

ipcMain.on("window-close", () => win?.close())
ipcMain.on("window-minimize", () => win?.minimize())
ipcMain.on("window-background", (_event, color) => {
  if (typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color)) {
    win?.setBackgroundColor(color)
  }
})

const hasLock = app.requestSingleInstanceLock()
if (!hasLock) {
  app.quit()
} else {
  app.on("second-instance", () => {
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  })
  app.whenReady().then(createWindow)
  app.on("window-all-closed", () => app.quit())
}
