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
        fullscreen: saved.fullscreen !== false,
      }
    }
  } catch {
    // First launch has no saved window.
  }
  return { width: 420, height: 520, x: undefined, y: undefined, fullscreen: true }
}

function saveState(win) {
  if (win.isDestroyed()) return
  let previous = { width: 420, height: 520 }
  try {
    previous = JSON.parse(fs.readFileSync(boundsPath(), "utf8"))
  } catch {
    // Keep the default window size for the next time fullscreen exits.
  }
  const fullscreen = win.isFullScreen()
  const bounds = fullscreen
    ? {
        width: Number.isFinite(previous.width) ? previous.width : 420,
        height: Number.isFinite(previous.height) ? previous.height : 520,
        x: Number.isFinite(previous.x) ? previous.x : undefined,
        y: Number.isFinite(previous.y) ? previous.y : undefined,
      }
    : win.getBounds()
  fs.mkdirSync(path.dirname(boundsPath()), { recursive: true })
  fs.writeFileSync(boundsPath(), JSON.stringify({ ...bounds, fullscreen }))
}

function applyOverlay(win, fullscreen) {
  win.setAlwaysOnTop(!fullscreen, "floating")
  if (process.platform === "darwin") {
    win.setVisibleOnAllWorkspaces(!fullscreen, { visibleOnFullScreen: true })
  }
}

let win = null

function createWindow() {
  const state = readState()
  win = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 360,
    minHeight: 460,
    show: false,
    frame: false,
    fullscreen: state.fullscreen,
    backgroundColor: "#141414",
    autoHideMenuBar: true,
    alwaysOnTop: !state.fullscreen,
    title: "Margin",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  win.removeMenu()
  applyOverlay(win, state.fullscreen)
  win.loadURL(`${devUrl || "app://margin/"}?desktop=1`)
  win.once("ready-to-show", () => win?.show())
  win.on("move", () => {
    if (win && !win.isFullScreen()) saveState(win)
  })
  win.on("resize", () => {
    if (win && !win.isFullScreen()) saveState(win)
  })
  win.on("enter-full-screen", () => {
    if (!win) return
    applyOverlay(win, true)
    saveState(win)
    win.webContents.send("fullscreen-changed", true)
  })
  win.on("leave-full-screen", () => {
    if (!win) return
    applyOverlay(win, false)
    saveState(win)
    win.webContents.send("fullscreen-changed", false)
  })
}

ipcMain.on("window-close", () => win?.close())
ipcMain.on("window-minimize", () => win?.minimize())
ipcMain.on("window-fullscreen", () => {
  if (!win) return
  win.setFullScreen(!win.isFullScreen())
})
ipcMain.handle("window-is-fullscreen", () => win?.isFullScreen() ?? false)
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
  app.on("window-all-closed", () => app.quit())
}
