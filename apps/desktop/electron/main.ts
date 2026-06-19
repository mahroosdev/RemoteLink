import { app, BrowserWindow, ipcMain, desktopCapturer, clipboard } from 'electron'
import path from 'node:path'
import { RemoteLinkServer } from './remotelinkServer'

// The built directory structure
process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(process.env.DIST, '../public')

let win: BrowserWindow | null

const remoteLinkServer = new RemoteLinkServer((state) => {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send('remotelink:state-changed', state)
  })
})

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

app.whenReady().then(createWindow)
