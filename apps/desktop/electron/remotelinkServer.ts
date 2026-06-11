import os from 'node:os'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import type { WebSocket as WebSocketType, WebSocketServer as WebSocketServerType } from 'ws'
import {
  MessageType,
  REMOTELINK_WS_PORT,
  type CommandLogPayload,
  type PairingRequestPayload,
  type RemoteLinkMessage,
  type RemoteLinkMonitor,
} from './protocol'

const nodeRequire = createRequire(import.meta.url)
const wsModule = nodeRequire('ws') as typeof import('ws')
const WebSocketServer = wsModule.WebSocketServer
const WebSocket = wsModule.WebSocket

export type ServerStatus = 'offline' | 'starting' | 'listening' | 'error'

export interface EngineDevice {
  name: string
  os: string
  status: 'Connected' | 'Disconnected' | 'Connecting' | 'Requesting'
  lastSeen: string
  ip: string
  deviceId: string
  appVersion?: string
}

export interface EngineLogItem {
  id: string
  event: string
  type: 'Pairing' | 'Monitor' | 'Keyboard' | 'Mouse' | 'Mobile' | 'System' | 'Security'
  timestamp: string
  device?: string
  status: 'Success' | 'Warning' | 'Error' | 'Info'
}

export interface EngineMonitor {
  id: number
  name: string
  resolution: string
  refreshRate: string
  isPrimary: boolean
  isActive: boolean
  quality: string
  fps: number
  protocolId: string
}

export interface PendingPairingRequest {
  deviceName: string
  deviceId: string
  appVersion: string
  ip: string
  requestedAt: string
}

export interface EngineState {
  engineActive: boolean
  serverStatus: ServerStatus
  hostIp: string
  hostIpCandidates: string[]
  hostIpFallbacks: string[]
  port: number
  pairingCode: string
  pendingRequest: PendingPairingRequest | null
  connectedDevice: EngineDevice | null
  detectedMonitors: EngineMonitor[]
  activityLog: EngineLogItem[]
  error?: string
}

interface PendingSocket {
  ws: WebSocketType
  request: PendingPairingRequest
}

const monitorState: EngineMonitor[] = [
  {
    id: 1,
    protocolId: 'screen-1',
    name: 'Screen 1',
    resolution: '1920 x 1080',
    refreshRate: '60Hz',
    isPrimary: true,
    isActive: true,
    quality: 'High',
    fps: 60,
  },
  {
    id: 2,
    protocolId: 'screen-2',
    name: 'Screen 2',
    resolution: '1920 x 1080',
    refreshRate: '60Hz',
    isPrimary: false,
    isActive: false,
    quality: 'High',
    fps: 60,
  },
]

export class RemoteLinkServer {
  private server: WebSocketServerType | null = null
  private pending: PendingSocket | null = null
  private connected: { ws: WebSocketType; device: EngineDevice; sessionId: string } | null = null
  private notify: (state: EngineState) => void
  private state: EngineState = {
    engineActive: false,
    serverStatus: 'offline',
    hostIp: 'Local IP unavailable',
    hostIpCandidates: [],
    hostIpFallbacks: [],
    port: REMOTELINK_WS_PORT,
    pairingCode: generatePairingCode(),
    pendingRequest: null,
    connectedDevice: null,
    detectedMonitors: monitorState,
    activityLog: [],
  }

  constructor(notify: (state: EngineState) => void) {
    this.notify = notify
  }

  getState() {
    return JSON.parse(JSON.stringify(this.state)) as EngineState
  }

  async startEngine() {
    if (this.server || this.state.serverStatus === 'starting') return this.getState()

    this.state.serverStatus = 'starting'
    this.state.engineActive = false
    const localIps = detectLocalIPv4Candidates()
    this.state.hostIpCandidates = localIps.recommended
    this.state.hostIpFallbacks = localIps.fallback
    this.state.hostIp = localIps.recommended[0] ?? localIps.fallback[0] ?? 'Local IP unavailable'
    this.state.error = undefined
    this.state.pairingCode = generatePairingCode()
    this.addLog('Remote Engine starting on local network', 'System', 'Info', false)
    this.emit()

    try {
      if (typeof WebSocketServer !== 'function') {
        throw new Error('WebSocketServer constructor is unavailable from ws module')
      }
      this.server = new WebSocketServer({ host: '0.0.0.0', port: REMOTELINK_WS_PORT })
      this.server.on('connection', (ws, request) => this.handleConnection(ws, request.socket.remoteAddress ?? 'Unknown'))
      await new Promise<void>((resolve, reject) => {
        const server = this.server
        if (!server) {
          reject(new Error('Remote Engine server was not created'))
          return
        }
        const onListening = () => {
          server.off('error', onError)
          resolve()
        }
        const onError = (error: Error & { code?: string }) => {
          server.off('listening', onListening)
          reject(error)
        }
        server.once('listening', onListening)
        server.once('error', onError)
      })
      this.server.on('error', (error: Error & { code?: string }) => this.failServer(error))
      this.state.engineActive = true
      this.state.serverStatus = 'listening'
      this.addLog(`Remote Engine listening on ${this.state.hostIp}:${REMOTELINK_WS_PORT}`, 'System', 'Success')
    } catch (error) {
      this.server?.close()
      this.server = null
      this.state.engineActive = false
      this.state.serverStatus = 'error'
      this.state.error = formatServerError(error)
      console.error('[RemoteLink] Remote Engine failed to start:', error)
      this.addLog(`Remote Engine failed to start: ${this.state.error}`, 'System', 'Error')
    }

    this.emit()
    return this.getState()
  }

  stopEngine() {
    if (this.connected?.ws.readyState === WebSocket.OPEN) {
      this.send(this.connected.ws, MessageType.Disconnect, { reason: 'Remote Engine stopped' }, this.connected.device.deviceId, this.connected.sessionId)
    }
    if (this.pending?.ws.readyState === WebSocket.OPEN) {
      this.send(this.pending.ws, MessageType.PairingDenied, { reason: 'Remote Engine stopped' }, this.pending.request.deviceId)
    }
    for (const client of this.server?.clients ?? []) client.close()
    this.server?.close()
    this.server = null
    this.pending = null
    this.connected = null
    this.state.engineActive = false
    this.state.serverStatus = 'offline'
    this.state.pendingRequest = null
    this.state.connectedDevice = null
    this.state.error = undefined
    this.addLog('Remote Engine stopped; local clients disconnected', 'System', 'Info')
    this.emit()
    return this.getState()
  }

  regeneratePairingCode() {
    this.state.pairingCode = generatePairingCode()
    this.addLog('Pairing code regenerated by host', 'Pairing', 'Info')
    this.emit()
    return this.getState()
  }

  approvePairing() {
    if (!this.pending || this.pending.ws.readyState !== WebSocket.OPEN) {
      this.clearPending()
      return this.getState()
    }

    const sessionId = crypto.randomUUID()
    const device: EngineDevice = {
      name: this.pending.request.deviceName,
      os: 'Android / RemoteLink Mobile',
      status: 'Connected',
      lastSeen: 'Active Now',
      ip: this.pending.request.ip,
      deviceId: this.pending.request.deviceId,
      appVersion: this.pending.request.appVersion,
    }
    this.connected = { ws: this.pending.ws, device, sessionId }
    this.pending = null
    this.state.pendingRequest = null
    this.state.connectedDevice = device
    const protocolMonitors = this.protocolMonitors()

    this.send(this.connected.ws, MessageType.PairingApproved, {
      sessionId,
      hostName: os.hostname(),
      detectedMonitors: protocolMonitors,
    }, device.deviceId, sessionId)
    this.send(this.connected.ws, MessageType.MonitorList, { detectedMonitors: protocolMonitors }, device.deviceId, sessionId)
    this.addLog(`Mobile Authorization approved for ${device.name}`, 'Pairing', 'Success', true, device.name)
    this.emit()
    return this.getState()
  }

  denyPairing() {
    if (this.pending?.ws.readyState === WebSocket.OPEN) {
      this.send(this.pending.ws, MessageType.PairingDenied, { reason: 'Denied by desktop host' }, this.pending.request.deviceId)
      this.pending.ws.close()
      this.addLog(`Mobile Authorization denied for ${this.pending.request.deviceName}`, 'Pairing', 'Warning')
    }
    this.clearPending()
    this.emit()
    return this.getState()
  }

  disconnectDevice() {
    if (this.connected?.ws.readyState === WebSocket.OPEN) {
      this.send(this.connected.ws, MessageType.Disconnect, { reason: 'Disconnected by desktop host' }, this.connected.device.deviceId, this.connected.sessionId)
      this.connected.ws.close()
    }
    const deviceName = this.connected?.device.name
    this.connected = null
    this.state.connectedDevice = null
    this.addLog(deviceName ? `Session disconnected: ${deviceName}` : 'Session disconnected', 'System', 'Info')
    this.emit()
    return this.getState()
  }

  private handleConnection(ws: WebSocketType, rawIp: string) {
    const ip = normalizeIp(rawIp)
    if (!this.state.engineActive || this.state.serverStatus !== 'listening') {
      this.send(ws, MessageType.Error, { reason: 'Remote Engine is offline' })
      ws.close()
      return
    }

    ws.on('message', (data) => {
      const message = parseMessage(data.toString())
      if (!message) {
        this.send(ws, MessageType.Error, { reason: 'Invalid JSON message' })
        return
      }
      this.handleMessage(ws, ip, message)
    })

    ws.on('close', () => {
      if (this.pending?.ws === ws) this.clearPending()
      if (this.connected?.ws === ws) {
        const deviceName = this.connected.device.name
        this.connected = null
        this.state.connectedDevice = null
        this.addLog(`Mobile connection closed: ${deviceName}`, 'System', 'Warning')
      }
      this.emit()
    })
  }

  private handleMessage(ws: WebSocketType, ip: string, message: RemoteLinkMessage) {
    if (message.type === MessageType.PairingRequest) {
      this.handlePairingRequest(ws, ip, message.payload as PairingRequestPayload | undefined)
      return
    }
    if (message.type === MessageType.CommandLog) {
      this.handleCommandLog(message, message.payload as CommandLogPayload | undefined)
      return
    }
    if (message.type === MessageType.Disconnect) {
      this.disconnectDevice()
      return
    }
    if (message.type === MessageType.Heartbeat) {
      this.send(ws, MessageType.Heartbeat, { ok: true }, message.deviceId, message.sessionId)
    }
  }

  private handlePairingRequest(ws: WebSocketType, ip: string, payload?: PairingRequestPayload) {
    if (!payload?.deviceId || !payload.deviceName || !payload.pairingCode) {
      this.send(ws, MessageType.PairingDenied, { reason: 'Malformed pairing request' }, payload?.deviceId)
      ws.close()
      return
    }
    if (payload.pairingCode !== this.state.pairingCode) {
      this.send(ws, MessageType.PairingDenied, { reason: 'Invalid pairing code' }, payload.deviceId)
      this.addLog(`Pairing denied for ${payload.deviceName}: invalid pairing code`, 'Security', 'Warning')
      ws.close()
      return
    }
    if (this.connected) {
      this.send(ws, MessageType.PairingDenied, { reason: 'A mobile device is already connected' }, payload.deviceId)
      ws.close()
      return
    }

    if (this.pending?.ws.readyState === WebSocket.OPEN) {
      this.send(this.pending.ws, MessageType.PairingDenied, { reason: 'Superseded by a newer pairing request' }, this.pending.request.deviceId)
      this.pending.ws.close()
    }

    const request: PendingPairingRequest = {
      deviceName: payload.deviceName,
      deviceId: payload.deviceId,
      appVersion: payload.appVersion,
      ip,
      requestedAt: new Date().toISOString(),
    }
    this.pending = { ws, request }
    this.state.pendingRequest = request
    this.send(ws, MessageType.PairingPending, { reason: 'Waiting for desktop approval' }, payload.deviceId)
    this.addLog(`Pending pairing request from ${payload.deviceName} (${ip})`, 'Pairing', 'Info')
    this.emit()
  }

  private handleCommandLog(message: RemoteLinkMessage, payload?: CommandLogPayload) {
    if (!this.connected || message.sessionId !== this.connected.sessionId) {
      this.addLog('Rejected command_log from unapproved session', 'Security', 'Warning')
      return
    }
    if (!payload?.command) {
      this.addLog('Received malformed command_log message', 'Security', 'Warning', true, this.connected.device.name)
      return
    }
    const detailText = payload.details && Object.keys(payload.details).length > 0
      ? ` ${JSON.stringify(payload.details)}`
      : ''
    this.addLog(`command_log ${payload.command}${detailText}`, commandType(payload.command), 'Info', true, this.connected.device.name)
  }

  private clearPending() {
    this.pending = null
    this.state.pendingRequest = null
  }

  private send(ws: WebSocketType, type: string, payload?: unknown, deviceId?: string, sessionId?: string) {
    if (ws.readyState !== WebSocket.OPEN) return
    ws.send(JSON.stringify({
      type,
      timestamp: new Date().toISOString(),
      deviceId,
      sessionId,
      payload,
    }))
  }

  private protocolMonitors(): RemoteLinkMonitor[] {
    return this.state.detectedMonitors.map((monitor) => ({
      id: monitor.protocolId,
      label: monitor.name,
      primary: monitor.isPrimary,
    }))
  }

  private addLog(
    event: string,
    type: EngineLogItem['type'],
    status: EngineLogItem['status'] = 'Info',
    shouldEmit = true,
    device?: string,
  ) {
    this.state.activityLog = [{
      id: crypto.randomUUID(),
      event,
      type,
      status,
      device,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }, ...this.state.activityLog].slice(0, 100)
    if (shouldEmit) this.emit()
  }

  private emit() {
    this.notify(this.getState())
  }

  private failServer(error: Error & { code?: string }) {
    this.server?.close()
    this.server = null
    this.pending = null
    this.connected = null
    this.state.engineActive = false
    this.state.serverStatus = 'error'
    this.state.pendingRequest = null
    this.state.connectedDevice = null
    this.state.error = formatServerError(error)
    console.error('[RemoteLink] Remote Engine server error:', error)
    this.addLog(`Remote Engine error: ${this.state.error}`, 'System', 'Error')
    this.emit()
  }
}

function detectLocalIPv4Candidates() {
  const networks = os.networkInterfaces()
  const candidates: Array<{ address: string; score: number; virtual: boolean }> = []
  for (const [name, entries] of Object.entries(networks)) {
    const adapterName = name.toLowerCase()
    for (const entry of entries ?? []) {
      if (entry.family !== 'IPv4' || entry.internal || !isPrivateIPv4(entry.address)) continue
      const virtual = /virtualbox|vmware|hyper-v|wsl|docker|loopback|bluetooth|teredo|vethernet|virtual|tap|npcap/i.test(adapterName)
      const virtualPenalty = virtual ? -100 : 0
      const lanScore = entry.address.startsWith('192.168.') ? 30
        : entry.address.startsWith('10.') ? 20
          : is172Private(entry.address) ? 10
            : 0
      const adapterScore = /wi-?fi|wireless|ethernet|lan/i.test(adapterName) ? 20 : 0
      candidates.push({ address: entry.address, score: lanScore + adapterScore + virtualPenalty, virtual })
    }
  }
  const sorted = candidates
    .sort((a, b) => b.score - a.score || a.address.localeCompare(b.address))
  const recommended = sorted.filter((candidate) => !candidate.virtual).map((candidate) => candidate.address)
  const fallback = sorted.filter((candidate) => candidate.virtual).map((candidate) => candidate.address)
  return { recommended, fallback }
}

function normalizeIp(ip: string) {
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip
}

function generatePairingCode() {
  return crypto.randomInt(100000, 1000000).toString()
}

function isPrivateIPv4(address: string) {
  return address.startsWith('10.') || address.startsWith('192.168.') || is172Private(address)
}

function is172Private(address: string) {
  const parts = address.split('.').map(Number)
  return parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31
}

function formatServerError(error: unknown) {
  if (typeof error === 'object' && error && 'code' in error && (error as { code?: string }).code === 'EADDRINUSE') {
    return 'Port 47777 is already in use. Close the other RemoteLink instance.'
  }
  return error instanceof Error ? error.message : String(error)
}

function parseMessage(raw: string): RemoteLinkMessage | null {
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed.type === 'string' ? parsed : null
  } catch {
    return null
  }
}

function commandType(command: string): EngineLogItem['type'] {
  if (command.includes('click') || command.includes('scroll') || command.includes('touchpad')) return 'Mouse'
  if (command.includes('key') || command.includes('shortcut') || command === 'text' || command === 'release_all_keys') return 'Keyboard'
  if (command.includes('monitor')) return 'Monitor'
  return 'Mobile'
}
