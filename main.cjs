const { app, BrowserWindow, ipcMain, protocol, screen } = require("electron")
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

const defaultWindow = { width: 420, height: 560 }

function fillsDisplay(bounds) {
  if (!bounds || !Number.isFinite(bounds.width) || !Number.isFinite(bounds.height)) return false
  const display = screen.getDisplayMatching({
    x: Number.isFinite(bounds.x) ? bounds.x : 0,
    y: Number.isFinite(bounds.y) ? bounds.y : 0,
    width: bounds.width,
    height: bounds.height,
  })
  const near = (size, edge) => Math.abs(size - edge) < 80
  return (
    (near(bounds.width, display.bounds.width) && near(bounds.height, display.bounds.height)) ||
    (near(bounds.width, display.workArea.width) && near(bounds.height, display.workArea.height))
  )
}

function readState() {
  try {
    const saved = JSON.parse(fs.readFileSync(boundsPath(), "utf8"))
    const candidate = {
      width: saved.width,
      height: saved.height,
      x: Number.isFinite(saved.x) ? saved.x : undefined,
      y: Number.isFinite(saved.y) ? saved.y : undefined,
      fullscreen: saved.fullscreen === true,
    }
    if (Number.isFinite(candidate.width) && Number.isFinite(candidate.height) && !fillsDisplay(candidate)) {
      return candidate
    }
    if (candidate.fullscreen) return { ...defaultWindow, fullscreen: true }
  } catch {
    // First launch has no saved window.
  }
  return { ...defaultWindow, x: undefined, y: undefined, fullscreen: false }
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

let frameTimer = null

function copyBounds(bounds) {
  if (!bounds || !Number.isFinite(bounds.width) || !Number.isFinite(bounds.height)) return null
  const next = { width: Math.round(bounds.width), height: Math.round(bounds.height) }
  if (Number.isFinite(bounds.x)) next.x = Math.round(bounds.x)
  if (Number.isFinite(bounds.y)) next.y = Math.round(bounds.y)
  return next
}

function placeWindow(bounds, floating) {
  if (!win || win.isDestroyed()) return
  const frame = copyBounds(bounds)
  try {
    win.setResizable(true)
    win.setMovable(true)
    win.setHasShadow(floating)
    if (floating) win.setAlwaysOnTop(true, "floating")
    else win.setAlwaysOnTop(false)
  } catch {
    // Keep going so the size still changes.
  }
  if (!frame) return
  try {
    win.setBounds(frame)
  } catch {
    // A rejected window change should leave the app open.
  }
}

function queueFrame(bounds, floating) {
  if (frameTimer) clearTimeout(frameTimer)
  frameTimer = setTimeout(() => {
    frameTimer = null
    placeWindow(bounds, floating)
    saveState()
    notifyFullscreen()
    keepInDock()
  }, 0)
}

function applyWindowed() {
  placeWindow(null, true)
}

function rememberedWindow() {
  const saved = copyBounds(windowed)
  if (saved && !fillsDisplay(saved)) return saved
  const area = screen.getDisplayMatching(win.getBounds()).workArea
  return {
    width: defaultWindow.width,
    height: defaultWindow.height,
    x: Math.round(area.x + (area.width - defaultWindow.width) / 2),
    y: Math.round(area.y + (area.height - defaultWindow.height) / 2),
  }
}

function setFilled(next) {
  if (!win || win.isDestroyed() || next === filled) return
  if (next) {
    const current = win.getBounds()
    if (!fillsDisplay(current)) windowed = copyBounds(current)
    filled = true
    queueFrame(screen.getDisplayMatching(current).bounds, false)
    return
  }
  filled = false
  queueFrame(rememberedWindow(), true)
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
    hasShadow: true,
    resizable: true,
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
  const remember = () => {
    if (!settled || !win || filled || win.isFullScreen()) return
    const bounds = win.getBounds()
    if (fillsDisplay(bounds)) return
    windowed = copyBounds(bounds)
    saveState()
  }
  win.on("move", remember)
  win.on("resize", remember)
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
