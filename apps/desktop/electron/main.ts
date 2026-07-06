import { app, BrowserWindow, ipcMain, desktopCapturer, clipboard, screen, dialog, type Display, type IpcMainInvokeEvent, type MessageBoxOptions } from 'electron'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { RemoteLinkServer, type EngineMonitor } from './remotelinkServer'
import type { MobileScreenFrameBroadcast } from './protocol'

const isDev = !app.isPackaged
const devRendererUrl = 'http://127.0.0.1:5173/'
const MAX_CLIPBOARD_TEXT_LENGTH = 256 * 1024
const FIREWALL_TCP_RULE_NAME = 'RemoteLink Local TCP 47777'
const FIREWALL_UDP_RULE_NAME = 'RemoteLink Local UDP Discovery 47778'
// Cache firewall diagnostics so bursts of engine status transitions don't each
// spawn a Get-NetFirewallRule PowerShell scan. Manual refresh/repair force a
// fresh read.
const FIREWALL_STATUS_CACHE_TTL_MS = 5000

// The built directory structure
process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(process.env.DIST, '../public')

if (isDev) {
  app.setPath('userData', path.join(app.getPath('temp'), 'RemoteLink Desktop Dev'))
}

const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
  process.exit(0)
}

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

async function captureMonitorFrame(monitor: EngineMonitor) {
  const maxWidth = 960
  const aspect = monitor.bounds.height > 0 ? monitor.bounds.width / monitor.bounds.height : 16 / 9
  const width = Math.min(maxWidth, Math.max(320, monitor.bounds.width))
  const height = Math.max(180, Math.round(width / aspect))
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width, height },
    fetchWindowIcons: false,
  })
  const displayId = monitor.protocolId.replace(/^display-/, '')
  const matchedSource = sources.find((item) => String((item as any).display_id ?? '') === displayId)
  // Only fall back to the sole source when there is exactly one screen; never
  // guess by index, which could stream a different monitor than requested.
  const source = matchedSource ?? (sources.length === 1 ? sources[0] : undefined)
  if (!source) {
    throw new Error(`No capture source matched ${monitor.name}; refusing to capture a different screen`)
  }

  const image = source.thumbnail
  if (image.isEmpty()) throw new Error(`Capture source for ${monitor.name} returned an empty frame`)
  const size = image.getSize()
  const cursor = screen.getCursorScreenPoint()
  const cursorVisible =
    cursor.x >= monitor.bounds.x &&
    cursor.x <= monitor.bounds.x + monitor.bounds.width &&
    cursor.y >= monitor.bounds.y &&
    cursor.y <= monitor.bounds.y + monitor.bounds.height
  const cursorX = cursorVisible
    ? Math.round(((cursor.x - monitor.bounds.x) / Math.max(1, monitor.bounds.width)) * size.width)
    : undefined
  const cursorY = cursorVisible
    ? Math.round(((cursor.y - monitor.bounds.y) / Math.max(1, monitor.bounds.height)) * size.height)
    : undefined
  return {
    monitorId: monitor.protocolId,
    format: 'jpeg' as const,
    width: size.width,
    height: size.height,
    data: image.toJPEG(68).toString('base64'),
    cursorX,
    cursorY,
    cursorVisible,
  }
}

function broadcastMobileFrame(frame: MobileScreenFrameBroadcast) {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send('remotelink:mobile-frame', frame)
  })
}

const remoteLinkServer = new RemoteLinkServer((state) => {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send('remotelink:state-changed', state)
  })
}, detectDisplays, captureMonitorFrame, broadcastMobileFrame)

function getAppIconPath() {
  return path.join(process.env.VITE_PUBLIC!, 'remotelink-app.ico')
}

function createWindow() {
  if (win) {
    win.show()
    win.focus()
    return
  }
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

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (event, url) => {
    const isAllowedDevUrl = isDev && url.startsWith(devRendererUrl)
    const isAllowedFileUrl = !isDev && url.startsWith('file://')
    if (!isAllowedDevUrl && !isAllowedFileUrl) event.preventDefault()
  })

  const targetUrl = isDev ? devRendererUrl : process.env.VITE_DEV_SERVER_URL
  console.log(`[RemoteLink] Loading renderer from ${targetUrl ?? path.join(process.env.DIST!, 'index.html')}`)

  if (targetUrl) {
    win.loadURL(targetUrl)
  } else {
    win.loadFile(path.join(process.env.DIST!, 'index.html'))
  }
}

// IPC Handlers
function assertTrustedSender(event: IpcMainInvokeEvent) {
  if (!win || event.sender !== win.webContents) {
    throw new Error('Rejected IPC from unknown renderer')
  }
}

ipcMain.handle('get-desktop-sources', async (event) => {
  assertTrustedSender(event)
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 320, height: 180 }, fetchWindowIcons: false })
  return sources.slice(0, 16).map(source => ({
    id: source.id,
    name: source.name,
    thumbnail: source.thumbnail.toDataURL(),
  }))
})

ipcMain.handle('remotelink:get-engine-state', (event) => {
  assertTrustedSender(event)
  return remoteLinkServer.getState()
})
ipcMain.handle('remotelink:start-engine', (event) => {
  assertTrustedSender(event)
  return remoteLinkServer.startEngine()
})
ipcMain.handle('remotelink:stop-engine', (event) => {
  assertTrustedSender(event)
  return remoteLinkServer.stopEngine()
})
ipcMain.handle('remotelink:regenerate-pairing-code', (event) => {
  assertTrustedSender(event)
  return remoteLinkServer.regeneratePairingCode()
})
ipcMain.handle('remotelink:approve-pairing', (event) => {
  assertTrustedSender(event)
  return remoteLinkServer.approvePairing()
})
ipcMain.handle('remotelink:deny-pairing', (event) => {
  assertTrustedSender(event)
  return remoteLinkServer.denyPairing()
})
ipcMain.handle('remotelink:disconnect-device', (event) => {
  assertTrustedSender(event)
  return remoteLinkServer.disconnectDevice()
})
ipcMain.handle('remotelink:clear-activity-log', (event) => {
  assertTrustedSender(event)
  return remoteLinkServer.clearActivityLog()
})
ipcMain.handle('remotelink:release-all-keys', (event) => {
  assertTrustedSender(event)
  return remoteLinkServer.releaseAllModifiers('Released from desktop UI')
})
ipcMain.handle('remotelink:stop-phone-screen-share', (event) => {
  assertTrustedSender(event)
  return remoteLinkServer.stopPhoneScreenShare()
})
ipcMain.handle('remotelink:copy-text', (event, text: string) => {
  assertTrustedSender(event)
  if (typeof text !== 'string') throw new Error('Copy text must be a string')
  if (text.length > MAX_CLIPBOARD_TEXT_LENGTH) throw new Error('Copy text is too large')
  clipboard.writeText(text)
  return { ok: true }
})
ipcMain.handle('remotelink:get-firewall-status', async (event, force?: boolean) => {
  assertTrustedSender(event)
  return getFirewallStatus(force === true)
})
ipcMain.handle('remotelink:repair-local-firewall', async (event) => {
  assertTrustedSender(event)
  return repairLocalFirewall()
})

app.on('window-all-closed', () => {
  remoteLinkServer.stopEngine()
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

// Terminate the persistent PowerShell input worker(s) so they are never left
// orphaned when the app exits (Node does not job-object children on Windows).
app.on('before-quit', () => {
  remoteLinkServer.shutdown()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  } else {
    createWindow()
  }
})

app.whenReady().then(() => {
  remoteLinkServer.refreshMonitors('Initial display detection')
  screen.on('display-added', () => remoteLinkServer.refreshMonitors('Display configuration changed'))
  screen.on('display-removed', () => remoteLinkServer.refreshMonitors('Display configuration changed'))
  screen.on('display-metrics-changed', () => remoteLinkServer.refreshMonitors('Display configuration changed'))
  console.log(`[RemoteLink] Dev renderer URL pinned to ${devRendererUrl}`)
  createWindow()
})

interface FirewallRuleSummary {
  displayName: string
  program: string
}

interface FirewallStatus {
  platform: string
  supported: boolean
  appPath: string
  appName: string
  packaged: boolean
  tcpRuleName: string
  udpRuleName: string
  hasScopedTcpAllow: boolean
  hasScopedUdpAllow: boolean
  hasEnabledBlockRules: boolean
  blockRules: FirewallRuleSummary[]
  checkedAt: string
  error?: string
}

interface FirewallRepairResult {
  ok: boolean
  message: string
  status: FirewallStatus
}

function currentExecutableInfo() {
  const appPath = process.execPath
  return {
    appPath,
    appName: path.basename(appPath),
    packaged: app.isPackaged,
  }
}

let firewallStatusCache: { status: FirewallStatus; at: number } | null = null
let firewallStatusInFlight: Promise<FirewallStatus> | null = null

async function getFirewallStatus(force = false): Promise<FirewallStatus> {
  const now = Date.now()
  if (!force && firewallStatusCache && now - firewallStatusCache.at < FIREWALL_STATUS_CACHE_TTL_MS) {
    return firewallStatusCache.status
  }
  // Coalesce concurrent callers onto a single scan.
  if (!force && firewallStatusInFlight) return firewallStatusInFlight

  const run = computeFirewallStatus().then((status) => {
    firewallStatusCache = { status, at: Date.now() }
    return status
  })
  firewallStatusInFlight = run.finally(() => {
    if (firewallStatusInFlight === run) firewallStatusInFlight = null
  })
  return run
}

async function computeFirewallStatus(): Promise<FirewallStatus> {
  const executable = currentExecutableInfo()
  const baseStatus: FirewallStatus = {
    platform: process.platform,
    supported: process.platform === 'win32',
    ...executable,
    tcpRuleName: FIREWALL_TCP_RULE_NAME,
    udpRuleName: FIREWALL_UDP_RULE_NAME,
    hasScopedTcpAllow: false,
    hasScopedUdpAllow: false,
    hasEnabledBlockRules: false,
    blockRules: [],
    checkedAt: new Date().toISOString(),
  }

  if (process.platform !== 'win32') return baseStatus

  try {
    const script = `
$ErrorActionPreference = 'Stop'
$exe = ${psSingleQuoted(executable.appPath)}
$exeLeaf = [System.IO.Path]::GetFileName($exe)
$matchNames = @($exeLeaf, 'RemoteLink.exe', 'electron.exe') | Sort-Object -Unique
$tcpName = ${psSingleQuoted(FIREWALL_TCP_RULE_NAME)}
$udpName = ${psSingleQuoted(FIREWALL_UDP_RULE_NAME)}

function Test-ScopedRule($displayName, $protocol, $port) {
  $rules = @(Get-NetFirewallRule -DisplayName $displayName -ErrorAction SilentlyContinue | Where-Object {
    $_.Enabled -eq 'True' -and $_.Direction -eq 'Inbound' -and $_.Action -eq 'Allow'
  })
  foreach ($rule in $rules) {
    $portFilter = Get-NetFirewallPortFilter -AssociatedNetFirewallRule $rule -ErrorAction SilentlyContinue
    if ($portFilter.Protocol -eq $protocol -and [string]$portFilter.LocalPort -eq [string]$port) {
      return $true
    }
  }
  return $false
}

$blockRules = @()
$rules = @(Get-NetFirewallRule -Direction Inbound -Enabled True -Action Block -ErrorAction SilentlyContinue)
foreach ($rule in $rules) {
  $apps = @(Get-NetFirewallApplicationFilter -AssociatedNetFirewallRule $rule -ErrorAction SilentlyContinue)
  foreach ($appFilter in $apps) {
    $program = [string]$appFilter.Program
    if ([string]::IsNullOrWhiteSpace($program)) { continue }
    $programLeaf = [System.IO.Path]::GetFileName($program)
    if ($program -ieq $exe -or $matchNames -contains $programLeaf) {
      $blockRules += [PSCustomObject]@{
        displayName = [string]$rule.DisplayName
        program = $program
      }
    }
  }
}

[PSCustomObject]@{
  hasScopedTcpAllow = Test-ScopedRule $tcpName 'TCP' 47777
  hasScopedUdpAllow = Test-ScopedRule $udpName 'UDP' 47778
  hasEnabledBlockRules = $blockRules.Count -gt 0
  blockRules = @($blockRules)
} | ConvertTo-Json -Depth 5 -Compress
`
    const output = await runPowerShell(script, 4000)
    const parsed = JSON.parse(output || '{}') as Partial<FirewallStatus>
    const rawBlockRules = (parsed as any).blockRules
    const blockRules = Array.isArray(rawBlockRules)
      ? rawBlockRules
      : rawBlockRules
        ? [rawBlockRules]
        : []
    return {
      ...baseStatus,
      hasScopedTcpAllow: parsed.hasScopedTcpAllow === true,
      hasScopedUdpAllow: parsed.hasScopedUdpAllow === true,
      hasEnabledBlockRules: parsed.hasEnabledBlockRules === true,
      blockRules: blockRules
        .map((rule) => ({
          displayName: String((rule as FirewallRuleSummary).displayName ?? 'Unnamed block rule'),
          program: String((rule as FirewallRuleSummary).program ?? ''),
        })).slice(0, 8),
    }
  } catch (error) {
    return {
      ...baseStatus,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function repairLocalFirewall(): Promise<FirewallRepairResult> {
  if (process.platform !== 'win32') {
    const status = await getFirewallStatus()
    return {
      ok: false,
      message: 'Automatic firewall repair is available only on Windows.',
      status,
    }
  }

  const executable = currentExecutableInfo()
  const confirmationOptions: MessageBoxOptions = {
    type: 'question',
    buttons: ['Cancel', 'Allow Local Connection'],
    cancelId: 0,
    defaultId: 0,
    title: 'Allow Local Connection?',
    message: 'RemoteLink will ask Windows permission to add scoped local firewall rules.',
    detail: 'This adds only inbound TCP 47777 for the local connection and UDP 47778 for local discovery, scoped to local-subnet traffic. It does not open all ports or enable cloud/worldwide access.',
    noLink: true,
  }
  const choice = win
    ? await dialog.showMessageBox(win, confirmationOptions)
    : await dialog.showMessageBox(confirmationOptions)
  if (choice.response !== 1) {
    return {
      ok: false,
      message: 'Firewall repair was cancelled.',
      status: await getFirewallStatus(),
    }
  }

  const script = `
$ErrorActionPreference = 'Stop'
$exe = ${psSingleQuoted(executable.appPath)}
$tcpName = ${psSingleQuoted(FIREWALL_TCP_RULE_NAME)}
$udpName = ${psSingleQuoted(FIREWALL_UDP_RULE_NAME)}
$programExists = Test-Path -LiteralPath $exe

function Upsert-RemoteLinkRule($displayName, $protocol, $port) {
  $rule = Get-NetFirewallRule -DisplayName $displayName -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($null -eq $rule) {
    $params = @{
      DisplayName = $displayName
      Direction = 'Inbound'
      Action = 'Allow'
      Enabled = 'True'
      Profile = 'Any'
      Protocol = $protocol
      LocalPort = $port
      RemoteAddress = 'LocalSubnet'
      Description = 'RemoteLink local pairing only. Scoped to this app, local subnet, and the required local port.'
    }
    if ($programExists) { $params.Program = $exe }
    New-NetFirewallRule @params | Out-Null
    return
  }

  Set-NetFirewallRule -Name $rule.Name -Enabled True -Direction Inbound -Action Allow -Profile Any
  Get-NetFirewallAddressFilter -AssociatedNetFirewallRule $rule | Set-NetFirewallAddressFilter -RemoteAddress LocalSubnet
  Get-NetFirewallPortFilter -AssociatedNetFirewallRule $rule | Set-NetFirewallPortFilter -Protocol $protocol -LocalPort $port
  if ($programExists) {
    Get-NetFirewallApplicationFilter -AssociatedNetFirewallRule $rule | Set-NetFirewallApplicationFilter -Program $exe
  }
}

Upsert-RemoteLinkRule $tcpName 'TCP' 47777
Upsert-RemoteLinkRule $udpName 'UDP' 47778
`

  try {
    await runElevatedPowerShell(script)
    return {
      ok: true,
      message: 'Scoped local firewall rules were requested. Windows may still show a block warning if a separate RemoteLink or Electron block rule exists.',
      status: await getFirewallStatus(true),
    }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
      status: await getFirewallStatus(true),
    }
  }
}

function runPowerShell(script: string, timeout = 10000) {
  return new Promise<string>((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
      encoding: 'utf8',
      timeout,
      windowsHide: true,
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr.trim() || error.message))
        return
      }
      resolve(stdout.trim())
    })
  })
}

async function runElevatedPowerShell(script: string) {
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  const launcher = [
    "$ErrorActionPreference = 'Stop'",
    `$process = Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand','${encoded}') -Verb RunAs -Wait -PassThru`,
    'if ($process.ExitCode -ne 0) { throw "Firewall repair exited with code $($process.ExitCode)" }',
  ].join('\n')
  await runPowerShell(launcher, 120000)
}

function psSingleQuoted(value: string) {
  return `'${value.replace(/'/g, "''")}'`
}

