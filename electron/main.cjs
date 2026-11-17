const { app, BrowserWindow, ipcMain, protocol } = require("electron")
const fs = require("fs")
const path = require("path")

if (process.platform === "linux") {
  app.commandLine.appendSwitch("no-sandbox")
}

app.setName("Margin")

const devUrl = process.env.MARGIN_DEV_URL
const webRoot = path.join(__dirname, "..", "out")

protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
])

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
}

function serveBundledApp() {
  protocol.handle("app", async (request) => {
    const { pathname } = new URL(request.url)
    let relative = decodeURIComponent(pathname)
    if (relative.endsWith("/")) relative += "index.html"
    const file = path.normalize(path.join(webRoot, relative))
    if (!file.startsWith(webRoot)) return new Response("Not found", { status: 404 })
    try {
      const body = await fs.promises.readFile(file)
      const type = mimeTypes[path.extname(file)] || "application/octet-stream"
      return new Response(body, { headers: { "content-type": type } })
    } catch {
      return new Response("Not found", { status: 404 })
    }
  })
}

const boundsPath = () => path.join(app.getPath("userData"), "window.json")

function readState() {
  try {
    const saved = JSON.parse(fs.readFileSync(boundsPath(), "utf8"))
    if (Number.isFinite(saved.width) && Number.isFinite(saved.height)) {
      return {
        width: saved.width,
        height: saved.height,
        x: Number.isFinite(saved.x) ? saved.x : undefined,
        y: Number.isFinite(saved.y) ? saved.y : undefined,
        fullscreen: saved.fullscreen === true,
      }
    }
  } catch {
    // First launch has no saved window.
  }
  return { width: 420, height: 560, x: undefined, y: undefined, fullscreen: false }
}

let win = null
let filled = false
let windowed = null
let settled = false

function windowIsFullscreen() {
  return filled
}

function saveState() {
  if (!win || win.isDestroyed()) return
  const bounds = windowed || win.getBounds()
  fs.mkdirSync(path.dirname(boundsPath()), { recursive: true })
  fs.writeFileSync(boundsPath(), JSON.stringify({ ...bounds, fullscreen: filled }))
}

function keepInDock() {
  if (process.platform !== "darwin" || !app.dock) return
  const show = () => {
    if (!app.dock) return
    app.setActivationPolicy("regular")
    app.dock.show()
  }
  show()
  setTimeout(show, 0)
}

function notifyFullscreen() {
  if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return
  win.webContents.send("fullscreen-changed", filled)
}

function applyWindowed() {
  if (!win || win.isDestroyed()) return
  win.setMovable(true)
  win.setAlwaysOnTop(true, "floating")
  if (process.platform === "darwin") {
    win.setSimpleFullScreen(false)
    win.setVisibleOnAllWorkspaces(false)
  }
}

function setFilled(next) {
  if (!win || win.isDestroyed()) return
  if (next) {
    if (filled || win.isFullScreen()) return
    windowed = win.getBounds()
    win.setAlwaysOnTop(false)
    if (process.platform === "darwin") {
      win.setSimpleFullScreen(false)
      win.setVisibleOnAllWorkspaces(false)
    }
    win.setFullScreen(true)
    return
  }
  if (!filled && !win.isFullScreen()) return
  win.setFullScreen(false)
  if (process.platform === "darwin") win.setSimpleFullScreen(false)
}

function createWindow() {
  const state = readState()
  windowed = { width: state.width, height: state.height, x: state.x, y: state.y }
  win = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 360,
    minHeight: 460,
    show: false,
    frame: false,
    backgroundColor: "#141414",
    autoHideMenuBar: true,
    alwaysOnTop: true,
    movable: true,
    fullscreenable: true,
    skipTaskbar: false,
    title: "Margin",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  win.removeMenu()
  applyWindowed()
  keepInDock()
  win.loadURL(`${devUrl || "app://margin/"}?desktop=1`)
  win.on("enter-full-screen", () => {
    filled = true
    saveState()
    notifyFullscreen()
    keepInDock()
  })
  win.on("leave-full-screen", () => {
    filled = false
    applyWindowed()
    if (windowed) win.setBounds(windowed)
    saveState()
    notifyFullscreen()
    keepInDock()
  })
  win.webContents.on("before-input-event", (_event, input) => {
    if (input.type === "keyDown" && input.key === "Escape" && (filled || win?.isFullScreen())) {
      setFilled(false)
    }
  })
  win.once("ready-to-show", () => {
    if (!win) return
    win.show()
    if (state.fullscreen) setFilled(true)
    keepInDock()
    settled = true
  })
  win.on("move", () => {
    if (!settled || !win || filled || win.isFullScreen()) return
    windowed = win.getBounds()
    saveState()
  })
  win.on("resize", () => {
    if (!settled || !win || filled || win.isFullScreen()) return
    windowed = win.getBounds()
    saveState()
  })
}

ipcMain.on("window-close", () => win?.close())
ipcMain.on("window-minimize", () => win?.minimize())
ipcMain.on("window-fullscreen", () => setFilled(!filled))
ipcMain.handle("window-is-fullscreen", () => filled)
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
  app.whenReady().then(() => {
    if (!devUrl) serveBundledApp()
    createWindow()
  })
  app.on("before-quit", () => {
    keepInDock()
  })
  app.on("window-all-closed", () => app.quit())
}
