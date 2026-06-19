import { app, BrowserWindow, ipcMain, desktopCapturer, clipboard, screen, type Display } from 'electron'
import path from 'node:path'
import { RemoteLinkServer, type EngineMonitor } from './remotelinkServer'

// The built directory structure
process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(process.env.DIST, '../public')

let win: BrowserWindow | null

function detectDisplays(): EngineMonitor[] {
  const displays = screen.getAllDisplays()
  const primaryDisplay = screen.getPrimaryDisplay()
  const sorted = [...displays].sort((a, b) => {
    if (a.id === primaryDisplay.id) return -1
    if (b.id === primaryDisplay.id) return 1
    return a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y || a.id - b.id
  })

  return sorted.map((display: Display, index) => {
    const width = Math.round(display.bounds.width)
    const height = Math.round(display.bounds.height)
    const protocolId = `display-${display.id}`
    return {
      id: index + 1,
      protocolId,
      name: `Screen ${index + 1}`,
      resolution: `${width} x ${height}`,
      refreshRate: 'Detected',
      isPrimary: display.id === primaryDisplay.id,
      isActive: false,
      quality: 'High',
      fps: 60,
      bounds: {
        x: Math.round(display.bounds.x),
        y: Math.round(display.bounds.y),
        width,
        height,
      },
      scaleFactor: display.scaleFactor,
    }
  })
}

const remoteLinkServer = new RemoteLinkServer((state) => {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send('remotelink:state-changed', state)
  })
}, detectDisplays)

function getAppIconPath() {
  return path.join(process.env.VITE_PUBLIC!, 'app-icon.ico')
}

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    icon: getAppIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    title: 'RemoteLink Pro',
    backgroundColor: '#0b0c0f'
  })

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(process.env.DIST!, 'index.html'))
  }
}

// IPC Handlers
ipcMain.handle('get-desktop-sources', async () => {
  const sources = await desktopCapturer.getSources({ types: ['window', 'screen'], thumbnailSize: { width: 320, height: 180 } })
  return sources.map(source => ({
    id: source.id,
    name: source.name,
    thumbnail: source.thumbnail.toDataURL(),
  }))
})

ipcMain.handle('remotelink:get-engine-state', () => remoteLinkServer.getState())
ipcMain.handle('remotelink:start-engine', () => remoteLinkServer.startEngine())
ipcMain.handle('remotelink:stop-engine', () => remoteLinkServer.stopEngine())
ipcMain.handle('remotelink:regenerate-pairing-code', () => remoteLinkServer.regeneratePairingCode())
ipcMain.handle('remotelink:approve-pairing', () => remoteLinkServer.approvePairing())
ipcMain.handle('remotelink:deny-pairing', () => remoteLinkServer.denyPairing())
ipcMain.handle('remotelink:disconnect-device', () => remoteLinkServer.disconnectDevice())
ipcMain.handle('remotelink:clear-activity-log', () => remoteLinkServer.clearActivityLog())
ipcMain.handle('remotelink:copy-text', (_event, text: string) => {
  if (typeof text !== 'string') throw new Error('Copy text must be a string')
  clipboard.writeText(text)
  return { ok: true }
})

app.on('window-all-closed', () => {
  remoteLinkServer.stopEngine()
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(() => {
  remoteLinkServer.refreshMonitors('Initial display detection')
  screen.on('display-added', () => remoteLinkServer.refreshMonitors('Display configuration changed'))
  screen.on('display-removed', () => remoteLinkServer.refreshMonitors('Display configuration changed'))
  screen.on('display-metrics-changed', () => remoteLinkServer.refreshMonitors('Display configuration changed'))
  createWindow()
})
