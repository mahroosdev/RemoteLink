import os from 'node:os'
import crypto from 'node:crypto'
import * as dgram from 'node:dgram'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import type { WebSocket as WebSocketType, WebSocketServer as WebSocketServerType } from 'ws'
import {
  MessageType,
  REMOTELINK_DISCOVERY_PORT,
  REMOTELINK_DISCOVERY_REQUEST,
  REMOTELINK_DISCOVERY_RESPONSE,
  REMOTELINK_WS_PORT,
  type CommandLogPayload,
  type InputCommandKind,
  type InputCommandPayload,
  type PairingRequestPayload,
  type RemoteLinkMessage,
  type RemoteLinkMonitor,
  type MobileScreenFramePayload,
  type MobileScreenFrameBroadcast,
  type MobileScreenStatusPayload,
  type ScreenFramePayload,
  type SelectMonitorPayload,
  type StartStreamPayload,
} from './protocol'
import { WindowsInputExecutor, type WindowsInputStatus } from './windowsInput'

const nodeRequire = createRequire(import.meta.url)
const wsModule = nodeRequire('ws') as typeof import('ws')
const WebSocketServer = wsModule.WebSocketServer
const WebSocket = wsModule.WebSocket
const MAX_WS_MESSAGE_BYTES = 6 * 1024 * 1024
const MAX_MOBILE_FRAME_BASE64_CHARS = 5_500_000
const MAX_MOBILE_FRAME_WIDTH = 1440
const MAX_MOBILE_FRAME_HEIGHT = 2560
const PAIRING_WINDOW_MS = 60_000
const PAIRING_MAX_ATTEMPTS_PER_WINDOW = 5
const PAIRING_COOLDOWN_MS = 30_000
const MAX_LOG_EVENT_LENGTH = 240
const MAX_LOG_DEVICE_LENGTH = 80
const KNOWN_MESSAGE_TYPES = new Set<string>(Object.values(MessageType))
const PRIVILEGED_MESSAGE_TYPES = new Set<string>([
  MessageType.CommandLog,
  MessageType.SelectMonitor,
  MessageType.InputCommand,
  MessageType.StartStream,
  MessageType.StopStream,
  MessageType.MobileScreenStart,
  MessageType.MobileScreenFrame,
  MessageType.MobileScreenStop,
  MessageType.MobileScreenStatus,
  MessageType.Disconnect,
])
const INPUT_STALE_MS = 140
const MOUSE_MOVE_FLUSH_MS = 16
const MAX_PENDING_INPUT_JOBS = 24
const INPUT_FAILURE_LOG_THROTTLE_MS = 5000
const VERBOSE_INPUT_LOGS = process.env.REMOTELINK_DEBUG_INPUT === '1'
const VERBOSE_PROTOCOL_LOGS = process.env.REMOTELINK_DEBUG_PROTOCOL === '1'
const NOISY_PROTOCOL_MESSAGE_TYPES = new Set<string>([
  MessageType.InputCommand,
  MessageType.MobileScreenFrame,
])

export type ServerStatus = 'offline' | 'starting' | 'listening' | 'error'
export type DiscoveryStatus = 'offline' | 'starting' | 'listening' | 'error'

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
  bounds: { x: number; y: number; width: number; height: number }
  scaleFactor: number
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
  discoveryStatus: DiscoveryStatus
  hostIp: string
  hostIpCandidates: string[]
  hostIpFallbacks: string[]
  port: number
  pairingCode: string
  pendingRequest: PendingPairingRequest | null
  connectedDevice: EngineDevice | null
  detectedMonitors: EngineMonitor[]
  selectedMonitorId: string | null
  lastInputAt: string | null
  inputStatus: WindowsInputStatus
  heldModifiers: string[]
  previewStream: {
    status: 'stopped' | 'starting' | 'active' | 'error'
    monitorId: string | null
    fps: number
    lastFrameAt: string | null
    error?: string
  }
  mobileScreenShare: {
    status: 'off' | 'stopped' | 'starting' | 'sharing' | 'stopping' | 'error'
    width: number
    height: number
    format: 'jpeg' | 'unknown'
    data: string | null
    lastFrameAt: string | null
    error?: string
  }
  activityLog: EngineLogItem[]
  error?: string
  discoveryError?: string
}

interface PendingSocket {
  ws: WebSocketType
  request: PendingPairingRequest
}

interface IpCandidate {
  address: string
  adapterName: string
  score: number
  hasGateway?: boolean
  active?: boolean
  ignoredReason?: string
}

interface IpDetectionResult {
  recommended: string[]
  fallback: string[]
  detected: string[]
  ignored: Array<{ address: string; adapterName: string; reason: string }>
  source: 'node' | 'powershell' | 'node+powershell'
}

export class RemoteLinkServer {
  private server: WebSocketServerType | null = null
  private discoverySocket: dgram.Socket | null = null
  private pending: PendingSocket | null = null
  private connected: { ws: WebSocketType; device: EngineDevice; sessionId: string } | null = null
  private notify: (state: EngineState) => void
  private detectMonitors: () => EngineMonitor[]
  private captureFrame: (monitor: EngineMonitor) => Promise<ScreenFramePayload>
  private sendMobileFrame: (frame: MobileScreenFrameBroadcast) => void
  private inputExecutor: WindowsInputExecutor
  private inputGeneration = 0
  private pendingInputJobs = 0
  private inputFallbackLogged = false
  private inputFailureLoggedAt = new Map<string, number>()
  private mouseMoveBuffer: {
    dx: number
    dy: number
    createdAt: number
    lastAt: number
    generation: number
    sessionId: string
    deviceId: string
    deviceName: string
    receivedAt: number
    mobileSentAt: number | null
  } | null = null
  private mouseMoveTimer: ReturnType<typeof setTimeout> | null = null
  private mouseMoveInFlight = false
  private staleInputDropLoggedAt = 0
  private inputLatencyWarnedAt = 0
  private streamTimer: ReturnType<typeof setInterval> | null = null
  private streamInFlight = false
  private streamFrameCount = 0
  private streamStartedAt = 0
  private mobileScreenFrameCount = 0
  private mobileScreenStopRequested = false
  // Tracks whether a live phone frame exists without keeping the base64 in
  // EngineState (frames travel over a dedicated IPC channel instead).
  private mobileHasFrame = false
  private heldModifiers = new Set<string>()
  private heldMouseButtons = new Set<'left' | 'right'>()
  private pairingAttempts = new Map<string, { count: number; windowStartedAt: number; blockedUntil: number }>()
  private state: EngineState = {
    engineActive: false,
    serverStatus: 'offline',
    discoveryStatus: 'offline',
    hostIp: 'Local IP unavailable',
    hostIpCandidates: [],
    hostIpFallbacks: [],
    port: REMOTELINK_WS_PORT,
    pairingCode: generatePairingCode(),
    pendingRequest: null,
    connectedDevice: null,
    detectedMonitors: [],
    selectedMonitorId: null,
    lastInputAt: null,
    inputStatus: 'idle',
    heldModifiers: [],
    previewStream: {
      status: 'stopped',
      monitorId: null,
      fps: 0,
      lastFrameAt: null,
    },
    mobileScreenShare: {
      status: 'off',
      width: 0,
      height: 0,
      format: 'unknown',
      data: null,
      lastFrameAt: null,
    },
    activityLog: [],
  }

  constructor(
    notify: (state: EngineState) => void,
    detectMonitors: () => EngineMonitor[],
    captureFrame: (monitor: EngineMonitor) => Promise<ScreenFramePayload>,
    sendMobileFrame: (frame: MobileScreenFrameBroadcast) => void,
  ) {
    this.notify = notify
    this.detectMonitors = detectMonitors
    this.captureFrame = captureFrame
    this.sendMobileFrame = sendMobileFrame
    this.inputExecutor = new WindowsInputExecutor((status) => this.setInputStatus(status))
  }

  getState() {
    return JSON.parse(JSON.stringify(this.state)) as EngineState
  }

  async startEngine() {
    if (this.server || this.state.serverStatus === 'starting') return this.getState()

    this.state.serverStatus = 'starting'
    this.state.discoveryStatus = 'offline'
    this.state.discoveryError = undefined
    this.state.engineActive = false
    this.refreshMonitors('Detected monitors before engine start', false)
    const localIps = detectLocalIPv4Candidates()
    this.state.hostIpCandidates = localIps.recommended
    this.state.hostIpFallbacks = localIps.fallback
    this.state.hostIp = localIps.recommended[0] ?? 'Local IP unavailable'
    this.state.error = undefined
    this.state.pairingCode = generatePairingCode()
    this.addLog('Remote Engine starting on local network', 'System', 'Info', false)
    this.addLog(`Detected interfaces (${localIps.source}): ${localIps.detected.join(', ') || 'none'}`, 'System', 'Info', false)
    for (const ignored of localIps.ignored.slice(0, 6)) {
      this.addLog(`Ignored ${ignored.address} on ${ignored.adapterName}: ${ignored.reason}`, 'System', 'Warning', false)
    }
    this.addLog(
      this.state.hostIp === 'Local IP unavailable'
        ? 'No pairable Wi-Fi/Ethernet Host IP detected'
        : `Selected recommended Host IP ${this.state.hostIp}`,
      'System',
      this.state.hostIp === 'Local IP unavailable' ? 'Warning' : 'Success',
      false,
    )
    this.emit()

    try {
      if (typeof WebSocketServer !== 'function') {
        throw new Error('WebSocketServer constructor is unavailable from ws module')
      }
      this.server = new WebSocketServer({ host: '0.0.0.0', port: REMOTELINK_WS_PORT, maxPayload: MAX_WS_MESSAGE_BYTES })
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
      this.inputFallbackLogged = false
      void this.inputExecutor.warmUp()
      const phoneUrl = this.state.hostIp === 'Local IP unavailable'
        ? `ws://<host-ip>:${REMOTELINK_WS_PORT}`
        : `ws://${this.state.hostIp}:${REMOTELINK_WS_PORT}`
      this.addLog(`WebSocket listening on 0.0.0.0:${REMOTELINK_WS_PORT}; phone URL ${phoneUrl}`, 'System', 'Success')
      this.startDiscoveryListener()
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
    this.resetInputPipeline('Remote Engine stopped', true)
    this.stopPreviewStream('Remote Engine stopped')
    void this.releaseAllModifiers('Remote Engine stopped', false).finally(() => {
      this.inputExecutor.markIdle()
      this.setInputStatus('idle')
    })
    this.stopDiscoveryListener()
    if (this.connected?.ws.readyState === WebSocket.OPEN) {
      this.sendMobileScreenStopped('Remote Engine stopped')
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
    this.state.discoveryStatus = 'offline'
    this.state.discoveryError = undefined
    this.state.pendingRequest = null
    this.state.connectedDevice = null
    this.state.lastInputAt = null
    this.state.inputStatus = 'idle'
    this.state.heldModifiers = []
    this.clearMobileScreenShare('Remote Engine stopped')
    this.state.error = undefined
    this.addLog('Remote Engine stopped; local clients disconnected', 'System', 'Info')
    this.emit()
    return this.getState()
  }

  // Called on application quit: stop the engine and terminate the persistent
  // PowerShell input worker(s) so no child processes are left orphaned.
  shutdown() {
    try {
      this.stopEngine()
    } catch {
      // Best effort during shutdown.
    }
    this.inputExecutor.stopWorker()
  }

  regeneratePairingCode() {
    this.state.pairingCode = generatePairingCode()
    this.addLog('Pairing code regenerated by host', 'Pairing', 'Info')
    this.emit()
    return this.getState()
  }

  approvePairing() {
    protocolLog('approval action received')
    if (!this.pending || this.pending.ws.readyState !== WebSocket.OPEN) {
      protocolLog('approval ignored: no open pending socket')
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
    this.refreshMonitors('Detected monitors before pairing approval', false)
    const monitorPayload = this.monitorListPayload()

    this.send(this.connected.ws, MessageType.PairingApproved, {
      sessionId,
      hostName: os.hostname(),
      ...monitorPayload,
    }, device.deviceId, sessionId)
    this.send(this.connected.ws, MessageType.MonitorList, monitorPayload, device.deviceId, sessionId)
    this.addLog(`Monitor list sent to mobile (${this.state.detectedMonitors.length} screen(s))`, 'Monitor', 'Info', false, device.name)
    this.addLog(`Mobile Authorization approved for ${device.name}`, 'Pairing', 'Success', true, device.name)
    this.emit()
    return this.getState()
  }

  denyPairing() {
    protocolLog('deny action received')
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
    this.resetInputPipeline('Disconnected by desktop host', true)
    this.stopPreviewStream('Disconnected by desktop host')
    void this.releaseAllModifiers('Disconnected by desktop host')
    if (this.connected?.ws.readyState === WebSocket.OPEN) {
      this.sendMobileScreenStopped('Disconnected by desktop host')
      this.send(this.connected.ws, MessageType.Disconnect, { reason: 'Disconnected by desktop host' }, this.connected.device.deviceId, this.connected.sessionId)
      this.connected.ws.close()
    }
    const deviceName = this.connected?.device.name
    this.connected = null
    this.state.connectedDevice = null
    this.state.selectedMonitorId = this.state.detectedMonitors[0]?.protocolId ?? null
    this.state.detectedMonitors = this.withActiveMonitor(this.state.detectedMonitors, this.state.selectedMonitorId)
    this.state.lastInputAt = null
    this.state.heldModifiers = []
    this.clearMobileScreenShare('Disconnected by desktop host')
    this.addLog(deviceName ? `Session disconnected: ${deviceName}` : 'Session disconnected', 'System', 'Info')
    this.emit()
    return this.getState()
  }

  clearActivityLog() {
    this.state.activityLog = []
    this.emit()
    return this.getState()
  }

  stopPhoneScreenShare(reason = 'Stopped from desktop') {
    const wasActive = this.isMobileScreenShareActive()
    if (this.connected?.ws.readyState === WebSocket.OPEN) {
      this.send(this.connected.ws, MessageType.MobileScreenStop, {
        status: 'stopping',
        message: reason,
      }, this.connected.device.deviceId, this.connected.sessionId)
    }
    this.state.mobileScreenShare = {
      status: 'stopped',
      width: 0,
      height: 0,
      format: 'unknown',
      data: null,
      lastFrameAt: null,
      error: undefined,
    }
    this.mobileScreenFrameCount = 0
    this.mobileHasFrame = false
    this.mobileScreenStopRequested = true
    this.addLog(
      wasActive ? 'Phone screen sharing stopped from desktop' : 'Phone screen sharing cleared from desktop',
      'Mobile',
      'Info',
      true,
      this.connected?.device.name,
    )
    this.emit()
    return this.getState()
  }

  private resetInputPipeline(reason: string, shouldLog = false) {
    this.inputGeneration += 1
    this.pendingInputJobs = 0
    this.mouseMoveBuffer = null
    if (this.mouseMoveTimer) {
      clearTimeout(this.mouseMoveTimer)
      this.mouseMoveTimer = null
    }
    this.inputExecutor.cancelPendingInput()
    void this.releaseHeldMouseButtons(reason, false)
    if (shouldLog) {
      this.addLog(`Input queue cleared: ${reason}`, 'Security', 'Info', false, this.connected?.device.name)
    }
  }

  private async releaseHeldMouseButtons(reason = 'Mouse drag released', shouldLog = true) {
    const buttons = [...this.heldMouseButtons]
    this.heldMouseButtons.clear()
    if (buttons.length === 0) {
      return this.getState()
    }

    try {
      await Promise.all(buttons.map((button) => this.inputExecutor.mouseButtonUp(button)))
    } catch (error) {
      if (shouldLog) {
        if (VERBOSE_INPUT_LOGS) {
          const reasonText = error instanceof Error ? error.message : String(error)
          console.warn(`[RemoteLink][input] release mouse buttons failed: ${reasonText}`)
        }
        this.logInputFailure('mouse', 'Mouse input is temporarily unavailable.', this.connected?.device.name)
      }
    }

    if (shouldLog) {
      this.addLog(reason, 'Mouse', 'Info', true, this.connected?.device.name)
    } else {
      this.emit()
    }
    return this.getState()
  }

  private setInputStatus(status: WindowsInputStatus) {
    if (this.state.inputStatus === status) return
    this.state.inputStatus = status
    if (status === 'fallback' && !this.inputFallbackLogged) {
      this.inputFallbackLogged = true
      this.addLog('Remote input is using fallback mode.', 'Security', 'Warning', true, this.connected?.device.name)
      return
    }
    if (status === 'unavailable') {
      this.logInputFailure('remote', 'Remote input is temporarily unavailable.', this.connected?.device.name)
      return
    }
    this.emit()
  }

  private logInputFailure(kind: 'mouse' | 'remote', message: string, deviceName?: string) {
    const now = Date.now()
    const lastLoggedAt = this.inputFailureLoggedAt.get(kind) ?? 0
    if (now - lastLoggedAt < INPUT_FAILURE_LOG_THROTTLE_MS) return
    this.inputFailureLoggedAt.set(kind, now)
    this.addLog(message, 'Security', 'Error', true, deviceName)
  }

  private isPreviewStreamActive() {
    return this.state.previewStream.status === 'starting' || this.state.previewStream.status === 'active'
  }

  private isMobileScreenShareActive() {
    return this.state.mobileScreenShare.status === 'starting' ||
      this.state.mobileScreenShare.status === 'sharing' ||
      this.state.mobileScreenShare.status === 'stopping' ||
      this.mobileHasFrame
  }

  private isInputContextCurrent(generation: number, sessionId: string, deviceId: string) {
    return Boolean(
      this.inputGeneration === generation &&
      this.state.engineActive &&
      this.state.serverStatus === 'listening' &&
      this.connected &&
      this.connected.sessionId === sessionId &&
      this.connected.device.deviceId === deviceId,
    )
  }

  private logStaleInputDropped(reason: string) {
    const now = Date.now()
    if (now - this.staleInputDropLoggedAt < 2000) return
    this.staleInputDropLoggedAt = now
    this.addLog(`Stale input dropped: ${reason}`, 'Security', 'Info', false, this.connected?.device.name)
    if (VERBOSE_INPUT_LOGS) console.warn(`[RemoteLink][input] stale mouse batch dropped: ${reason}`)
  }

  private logInputLatency(
    kind: string,
    metrics: { mobileToDesktopMs?: number | null; queueAgeMs?: number; executorMs?: number },
  ) {
    const slow = (metrics.queueAgeMs ?? 0) > INPUT_STALE_MS || (metrics.executorMs ?? 0) > 100
    if (!VERBOSE_INPUT_LOGS && !slow) return
    const now = Date.now()
    if (!VERBOSE_INPUT_LOGS && now - this.inputLatencyWarnedAt < 2000) return
    if (slow) this.inputLatencyWarnedAt = now
    const parts = [
      `kind=${kind}`,
      metrics.mobileToDesktopMs == null ? null : `mobileToDesktop=${Math.round(metrics.mobileToDesktopMs)}ms`,
      metrics.queueAgeMs == null ? null : `queueAge=${Math.round(metrics.queueAgeMs)}ms`,
      metrics.executorMs == null ? null : `executor=${Math.round(metrics.executorMs)}ms`,
    ].filter(Boolean).join(' ')
    if ((metrics.executorMs ?? 0) > 100) {
      console.warn(`[RemoteLink][input] input executor slow ${parts}`)
    } else if ((metrics.queueAgeMs ?? 0) > INPUT_STALE_MS) {
      console.warn(`[RemoteLink][input] stale mouse batch dropped ${parts}`)
    } else if (VERBOSE_INPUT_LOGS) {
      console.log(`[RemoteLink][input] latency ${parts}`)
    }
  }

  private enqueueMouseMove(
    command: { kind: 'mouse_move'; dx: number; dy: number },
    generation: number,
    sessionId: string,
    deviceId: string,
    deviceName: string,
    receivedAt: number,
    mobileSentAt: number | null,
  ) {
    const now = Date.now()
    if (!this.isInputContextCurrent(generation, sessionId, deviceId)) {
      this.logStaleInputDropped('mouse session changed')
      return
    }
    const current = this.mouseMoveBuffer
    if (current && current.generation === generation && current.sessionId === sessionId && current.deviceId === deviceId) {
      current.dx = clampInputDelta(current.dx + command.dx)
      current.dy = clampInputDelta(current.dy + command.dy)
      current.lastAt = now
      current.receivedAt = receivedAt
      current.mobileSentAt = mobileSentAt
    } else {
      this.mouseMoveBuffer = {
        dx: command.dx,
        dy: command.dy,
        createdAt: now,
        lastAt: now,
        generation,
        sessionId,
        deviceId,
        deviceName,
        receivedAt,
        mobileSentAt,
      }
    }
    this.scheduleMouseMoveFlush()
  }

  private scheduleMouseMoveFlush() {
    if (this.mouseMoveTimer || this.mouseMoveInFlight) return
    this.mouseMoveTimer = setTimeout(() => {
      this.mouseMoveTimer = null
      void this.flushMouseMove()
    }, MOUSE_MOVE_FLUSH_MS)
  }

  private async flushPendingMouseMoveNow() {
    if (this.mouseMoveTimer) {
      clearTimeout(this.mouseMoveTimer)
      this.mouseMoveTimer = null
    }
    for (let attempt = 0; attempt < 10; attempt += 1) {
      if (this.mouseMoveInFlight) {
        await delay(4)
        continue
      }
      if (!this.mouseMoveBuffer) return
      await this.flushMouseMove()
    }
  }

  private async flushMouseMove() {
    if (this.mouseMoveInFlight) return
    const batch = this.mouseMoveBuffer
    if (!batch) return
    this.mouseMoveBuffer = null
    this.mouseMoveInFlight = true
    try {
      const ageMs = Date.now() - batch.lastAt
      if (ageMs > INPUT_STALE_MS) {
        this.logInputLatency('mouse_move', {
          mobileToDesktopMs: batch.mobileSentAt == null ? null : batch.receivedAt - batch.mobileSentAt,
          queueAgeMs: ageMs,
        })
        this.logStaleInputDropped('mouse movement expired')
        return
      }
      if (!this.isInputContextCurrent(batch.generation, batch.sessionId, batch.deviceId)) {
        this.logStaleInputDropped('mouse session changed')
        return
      }
      const executorStartAt = Date.now()
      if (this.heldMouseButtons.size > 0) {
        await this.inputExecutor.mouseMoveOrdered(batch.dx, batch.dy)
      } else {
        await this.inputExecutor.mouseMove(batch.dx, batch.dy)
      }
      const executorMs = Date.now() - executorStartAt
      this.logInputLatency('mouse_move', {
        mobileToDesktopMs: batch.mobileSentAt == null ? null : batch.receivedAt - batch.mobileSentAt,
        queueAgeMs: executorStartAt - batch.receivedAt,
        executorMs,
      })
      if (!this.isInputContextCurrent(batch.generation, batch.sessionId, batch.deviceId)) {
        this.logStaleInputDropped('mouse session changed after execution')
        return
      }
      this.state.lastInputAt = new Date().toISOString()
    } catch (error) {
      if (VERBOSE_INPUT_LOGS) {
        const reason = error instanceof Error ? error.message : String(error)
        console.warn(`[RemoteLink][input] mouse input failed: ${reason}`)
      }
      this.logInputFailure('mouse', 'Mouse input is temporarily unavailable.', batch.deviceName)
    } finally {
      this.mouseMoveInFlight = false
      if (this.mouseMoveBuffer) this.scheduleMouseMoveFlush()
    }
  }

  private handleConnection(ws: WebSocketType, rawIp: string) {
    const ip = normalizeIp(rawIp)
    protocolLog(`socket connected remote=${redactIp(ip)}`)
    if (!this.state.engineActive || this.state.serverStatus !== 'listening') {
      protocolLog(`socket rejected remote=${redactIp(ip)} reason=engine_offline`)
      this.send(ws, MessageType.Error, { reason: 'Remote Engine is offline' })
      ws.close()
      return
    }
    this.addLog(`Incoming mobile connection from ${ip}`, 'Pairing', 'Info')

    ws.on('message', (data) => {
      if (messageByteLength(data) > MAX_WS_MESSAGE_BYTES) {
        this.addLog(`Rejected oversized WebSocket message from ${redactIp(ip)}`, 'Security', 'Warning')
        this.send(ws, MessageType.Error, { reason: 'Message too large' })
        ws.close()
        return
      }
      const message = parseMessage(data.toString())
      if (!message) {
        this.addLog(`Rejected malformed JSON message from ${redactIp(ip)}`, 'Security', 'Warning')
        protocolLog(`message rejected remote=${redactIp(ip)} reason=invalid_json`)
        this.send(ws, MessageType.Error, { reason: 'Invalid JSON message' })
        return
      }
      if (NOISY_PROTOCOL_MESSAGE_TYPES.has(message.type)) {
        protocolLog(`message received remote=${redactIp(ip)} type=${message.type}`, true)
      } else {
        protocolLog(`message received remote=${redactIp(ip)} type=${message.type}`)
      }
      this.handleMessage(ws, ip, message)
    })

    ws.on('close', () => {
      if (this.pending?.ws === ws) this.clearPending()
      if (this.connected?.ws === ws) {
        const deviceName = this.connected.device.name
        this.resetInputPipeline('Mobile client disconnected', true)
        this.stopPreviewStream('Mobile client disconnected')
        void this.releaseAllModifiers('Mobile client disconnected')
        this.connected = null
        this.state.connectedDevice = null
        this.state.lastInputAt = null
        this.state.heldModifiers = []
        this.clearMobileScreenShare('Mobile client disconnected')
        this.addLog(`Mobile connection closed: ${deviceName}`, 'System', 'Warning')
      }
      this.emit()
    })
  }

  private handleMessage(ws: WebSocketType, ip: string, message: RemoteLinkMessage) {
    if (!KNOWN_MESSAGE_TYPES.has(message.type)) {
      this.addLog(`Rejected unknown message type: ${truncate(String(message.type), 48)}`, 'Security', 'Warning')
      this.send(ws, MessageType.Error, { reason: 'Unknown message type' }, message.deviceId, message.sessionId)
      return
    }
    if (message.type === MessageType.PairingRequest) {
      this.handlePairingRequest(ws, ip, message.payload as PairingRequestPayload | undefined)
      return
    }
    if (PRIVILEGED_MESSAGE_TYPES.has(message.type) && !this.isApprovedMessage(ws, message)) {
      this.rejectUnapprovedMessage(ws, message)
      return
    }
    if (message.type === MessageType.CommandLog) {
      this.handleCommandLog(message, message.payload as CommandLogPayload | undefined)
      return
    }
    if (message.type === MessageType.SelectMonitor) {
      this.handleSelectMonitor(message, message.payload as SelectMonitorPayload | undefined)
      return
    }
    if (message.type === MessageType.InputCommand) {
      void this.handleInputCommand(message, message.payload as InputCommandPayload | undefined)
      return
    }
    if (message.type === MessageType.StartStream) {
      this.handleStartStream(message, message.payload as StartStreamPayload | undefined)
      return
    }
    if (message.type === MessageType.StopStream) {
      this.handleStopStream(message)
      return
    }
    if (message.type === MessageType.MobileScreenStart) {
      this.handleMobileScreenStart(message, message.payload as MobileScreenStatusPayload | undefined)
      return
    }
    if (message.type === MessageType.MobileScreenFrame) {
      this.handleMobileScreenFrame(message, message.payload as MobileScreenFramePayload | undefined)
      return
    }
    if (message.type === MessageType.MobileScreenStop) {
      this.handleMobileScreenStop(message, message.payload as MobileScreenStatusPayload | undefined)
      return
    }
    if (message.type === MessageType.MobileScreenStatus) {
      this.handleMobileScreenStatus(message, message.payload as MobileScreenStatusPayload | undefined)
      return
    }
    if (message.type === MessageType.Disconnect) {
      this.disconnectDevice()
      return
    }
    if (message.type === MessageType.Heartbeat) {
      this.send(ws, MessageType.Heartbeat, { ok: true }, message.deviceId, message.sessionId)
      return
    }
    this.send(ws, MessageType.Error, { reason: 'Unsupported message for current session' }, message.deviceId, message.sessionId)
  }

  private isApprovedMessage(ws: WebSocketType, message: RemoteLinkMessage) {
    return Boolean(
      this.connected &&
      this.connected.ws === ws &&
      message.sessionId === this.connected.sessionId &&
      message.deviceId === this.connected.device.deviceId,
    )
  }

  private rejectUnapprovedMessage(ws: WebSocketType, message: RemoteLinkMessage) {
    this.addLog(`Rejected ${message.type} from unapproved session`, 'Security', 'Warning')
    this.send(ws, MessageType.Error, { reason: 'Approved pairing session required' }, message.deviceId, message.sessionId)
  }

  private checkPairingRateLimit(ip: string) {
    const now = Date.now()
    const existing = this.pairingAttempts.get(ip)
    if (existing?.blockedUntil && existing.blockedUntil > now) return false
    if (!existing || now - existing.windowStartedAt > PAIRING_WINDOW_MS) {
      this.pairingAttempts.set(ip, { count: 1, windowStartedAt: now, blockedUntil: 0 })
      return true
    }
    existing.count += 1
    if (existing.count > PAIRING_MAX_ATTEMPTS_PER_WINDOW) {
      existing.blockedUntil = now + PAIRING_COOLDOWN_MS
      return false
    }
    return true
  }

  private handlePairingRequest(ws: WebSocketType, ip: string, payload?: PairingRequestPayload) {
    this.addLog(`Pairing request received from ${redactIp(ip)}`, 'Pairing', 'Info')
    protocolLog(
      `pairing_request received remote=${redactIp(ip)} deviceId=${redactDeviceId(payload?.deviceId)} codeLength=${String(payload?.pairingCode ?? '').length} appVersion=${payload?.appVersion ?? '(missing)'}`,
    )
    const requestPayload = normalizePairingRequest(payload)
    if (!requestPayload) {
      if (!this.checkPairingRateLimit(ip)) {
        this.send(ws, MessageType.PairingDenied, { reason: 'Too many pairing attempts. Wait and try again.' }, payload?.deviceId)
        this.addLog(`Pairing request rejected: cooldown active for ${redactIp(ip)}`, 'Security', 'Warning')
        protocolLog(`pairing_request rejected remote=${redactIp(ip)} reason=cooldown`)
        ws.close()
        return
      }
      this.send(ws, MessageType.PairingDenied, { reason: 'Malformed pairing request' }, payload?.deviceId)
      this.addLog(`Pairing request rejected: malformed payload from ${redactIp(ip)}`, 'Security', 'Warning')
      protocolLog(`pairing_request rejected remote=${redactIp(ip)} reason=malformed_payload`)
      ws.close()
      return
    }
    if (requestPayload.pairingCode !== this.state.pairingCode) {
      if (!this.checkPairingRateLimit(ip)) {
        this.send(ws, MessageType.PairingDenied, { reason: 'Too many pairing attempts. Wait and try again.' }, requestPayload.deviceId)
        this.addLog(`Pairing request rejected: cooldown active for ${redactIp(ip)}`, 'Security', 'Warning')
        protocolLog(`pairing_request rejected remote=${redactIp(ip)} reason=cooldown`)
        ws.close()
        return
      }
      this.send(ws, MessageType.PairingDenied, { reason: 'Invalid pairing code' }, requestPayload.deviceId)
      this.addLog(`Pairing request rejected for ${requestPayload.deviceName}: invalid pairing code`, 'Security', 'Warning')
      protocolLog(`pairing_request rejected remote=${redactIp(ip)} deviceId=${redactDeviceId(requestPayload.deviceId)} reason=invalid_pairing_code`)
      ws.close()
      return
    }
    this.pairingAttempts.delete(ip)
    if (this.connected) {
      this.send(ws, MessageType.PairingDenied, { reason: 'A mobile device is already connected' }, requestPayload.deviceId)
      this.addLog(`Pairing request rejected for ${requestPayload.deviceName}: device already connected`, 'Pairing', 'Warning')
      protocolLog(`pairing_request rejected remote=${redactIp(ip)} deviceId=${redactDeviceId(requestPayload.deviceId)} reason=device_already_connected`)
      ws.close()
      return
    }

    if (this.pending?.ws.readyState === WebSocket.OPEN) {
      this.send(this.pending.ws, MessageType.PairingDenied, { reason: 'Superseded by a newer pairing request' }, this.pending.request.deviceId)
      this.pending.ws.close()
    }

    const request: PendingPairingRequest = {
      deviceName: requestPayload.deviceName,
      deviceId: requestPayload.deviceId,
      appVersion: requestPayload.appVersion,
      ip,
      requestedAt: new Date().toISOString(),
    }
    this.pending = { ws, request }
    this.state.pendingRequest = request
    this.send(ws, MessageType.PairingPending, { reason: 'Waiting for desktop approval' }, requestPayload.deviceId)
    this.addLog(`Pairing request accepted for approval from ${requestPayload.deviceName} (${redactIp(ip)})`, 'Pairing', 'Info')
    protocolLog(`pairing_request accepted remote=${redactIp(ip)} deviceId=${redactDeviceId(requestPayload.deviceId)}`)
    protocolLog('pairing approval prompt emitted to renderer')
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
    this.addLog(`command_log ${sanitizeCommandLog(payload)}`, commandType(payload.command), 'Info', true, this.connected.device.name)
  }

  private async handleInputCommand(message: RemoteLinkMessage, payload?: InputCommandPayload) {
    const receivedAt = Date.now()
    const mobileSentAt = parseMessageTimestampMs(message.timestamp)
    if (!this.connected || message.sessionId !== this.connected.sessionId || message.deviceId !== this.connected.device.deviceId) {
      this.addLog('Rejected input from unapproved session', 'Security', 'Warning')
      return
    }

    const deviceName = this.connected.device.name
    const sessionId = this.connected.sessionId
    const deviceId = this.connected.device.deviceId
    const generation = this.inputGeneration
    const command = this.normalizeInputCommand(payload)
    if (!command) {
      this.addLog('Rejected malformed input message', 'Security', 'Warning', true, deviceName)
      return
    }

    if (command.kind === 'mouse_move') {
      this.enqueueMouseMove(command, generation, sessionId, deviceId, deviceName, receivedAt, mobileSentAt)
      return
    }

    if (this.pendingInputJobs >= MAX_PENDING_INPUT_JOBS) {
      this.logStaleInputDropped('input queue full')
      return
    }

    this.pendingInputJobs += 1
    try {
      if (!this.isInputContextCurrent(generation, sessionId, deviceId)) {
        this.logStaleInputDropped('session changed before execution')
        return
      }
      const executorStartAt = Date.now()
      await this.executeInputCommand(command)
      this.logInputLatency(command.kind, {
        mobileToDesktopMs: mobileSentAt == null ? null : receivedAt - mobileSentAt,
        queueAgeMs: executorStartAt - receivedAt,
        executorMs: Date.now() - executorStartAt,
      })
      if (!this.isInputContextCurrent(generation, sessionId, deviceId)) {
        this.logStaleInputDropped('session changed after execution')
        return
      }
      this.state.lastInputAt = new Date().toISOString()
      this.syncHeldModifiers()
      if (VERBOSE_INPUT_LOGS || command.kind !== 'mouse_scroll') {
        this.addLog(this.describeInputCommand(command), inputCommandLogType(command.kind), 'Success', true, deviceName)
      } else {
        this.emit()
      }
    } catch (error) {
      if (VERBOSE_INPUT_LOGS) {
        const reason = error instanceof Error ? error.message : String(error)
        console.warn(`[RemoteLink][input] command failed: ${reason}`)
      }
      this.logInputFailure('remote', 'Remote input is temporarily unavailable.', deviceName)
    } finally {
      this.pendingInputJobs = Math.max(0, this.pendingInputJobs - 1)
    }
  }

  private handleSelectMonitor(message: RemoteLinkMessage, payload?: SelectMonitorPayload) {
    if (!this.connected || message.sessionId !== this.connected.sessionId) {
      this.addLog('Rejected select_monitor from unapproved session', 'Security', 'Warning')
      return
    }
    const monitorId = payload?.monitorId
    const monitor = typeof monitorId === 'string'
      ? this.state.detectedMonitors.find((item) => item.protocolId === monitorId)
      : undefined
    if (!monitor) {
      this.addLog(`Invalid monitor selection rejected: ${monitorId ?? 'missing monitorId'}`, 'Monitor', 'Warning', true, this.connected.device.name)
      this.send(this.connected.ws, MessageType.MonitorList, this.monitorListPayload(), this.connected.device.deviceId, this.connected.sessionId)
      return
    }

    this.state.selectedMonitorId = monitor.protocolId
    this.state.detectedMonitors = this.withActiveMonitor(this.state.detectedMonitors, monitor.protocolId)
    this.addLog(`Selected monitor changed: ${monitor.name}`, 'Monitor', 'Success', true, this.connected.device.name)
    this.send(this.connected.ws, MessageType.MonitorList, this.monitorListPayload(), this.connected.device.deviceId, this.connected.sessionId)
    if (this.state.previewStream.status === 'active' || this.state.previewStream.status === 'starting') {
      this.startPreviewStream(monitor.protocolId)
    }
  }

  private handleStartStream(message: RemoteLinkMessage, payload?: StartStreamPayload) {
    if (!this.connected || message.sessionId !== this.connected.sessionId) {
      this.addLog('Rejected start_stream from unapproved session', 'Security', 'Warning')
      return
    }
    if (this.isMobileScreenShareActive()) {
      this.addLog('Preview start blocked while phone screen sharing is active', 'Monitor', 'Warning', true, this.connected.device.name)
      this.sendStreamStatus('error', 'Stop the current remote view before starting another.')
      return
    }
    const monitorId = normalizeOptionalMonitorId(payload?.monitorId)
    if (payload?.monitorId !== undefined && !monitorId) {
      this.addLog('Rejected malformed start_stream monitorId', 'Security', 'Warning', true, this.connected.device.name)
      this.sendStreamStatus('error', 'Invalid monitor selection')
      return
    }
    this.addLog('Preview start requested from mobile', 'Monitor', 'Info', true, this.connected.device.name)
    this.startPreviewStream(monitorId || this.state.selectedMonitorId)
  }

  private handleStopStream(message: RemoteLinkMessage) {
    if (!this.connected || message.sessionId !== this.connected.sessionId) {
      this.addLog('Rejected stop_stream from unapproved session', 'Security', 'Warning')
      return
    }
    this.stopPreviewStream('Stopped by mobile')
  }

  private handleMobileScreenStart(message: RemoteLinkMessage, payload?: MobileScreenStatusPayload) {
    if (!this.connected || message.sessionId !== this.connected.sessionId) {
      this.addLog('Rejected mobile_screen_start from unapproved session', 'Security', 'Warning')
      return
    }
    if (this.isPreviewStreamActive()) {
      this.addLog('PC preview stopped for phone screen sharing', 'Mobile', 'Info', true, this.connected.device.name)
      this.stopPreviewStream('Phone screen share starting')
    }
    const statusPayload = normalizeMobileScreenStatusPayload(payload, this.state.mobileScreenShare)
    if (!statusPayload) {
      this.addLog('Rejected malformed mobile_screen_start message', 'Security', 'Warning', true, this.connected.device.name)
      return
    }
    this.mobileScreenStopRequested = false
    this.state.mobileScreenShare = {
      ...this.state.mobileScreenShare,
      status: 'starting',
      width: statusPayload.width ?? this.state.mobileScreenShare.width,
      height: statusPayload.height ?? this.state.mobileScreenShare.height,
      format: 'unknown',
      data: null,
      error: undefined,
      lastFrameAt: null,
    }
    this.mobileScreenFrameCount = 0
    this.addLog('mobile_screen_start received; mobile screen share starting', 'Mobile', 'Info', true, this.connected.device.name)
    this.send(this.connected.ws, MessageType.MobileScreenStarted, {
      status: 'starting',
      message: statusPayload.message ?? 'Mobile screen share starting',
    }, this.connected.device.deviceId, this.connected.sessionId)
    this.emit()
  }

  private handleMobileScreenFrame(message: RemoteLinkMessage, payload?: MobileScreenFramePayload) {
    if (!this.connected || message.sessionId !== this.connected.sessionId) {
      this.addLog('Rejected mobile_screen_frame from unapproved session', 'Security', 'Warning')
      return
    }
    if (this.isPreviewStreamActive()) {
      this.addLog('PC preview stopped for incoming phone screen frame', 'Mobile', 'Info', false, this.connected.device.name)
      this.stopPreviewStream('Phone screen frame received')
    }
    if (this.mobileScreenStopRequested) {
      this.addLog('Stale phone screen frame ignored after stop request', 'Mobile', 'Info', false, this.connected.device.name)
      return
    }
    const frame = normalizeMobileScreenFramePayload(payload)
    if (!frame) {
      this.addLog(`mobile_screen_frame rejected: ${describeMobileScreenFrameRejectReason(payload)}`, 'Security', 'Warning', true, this.connected.device.name)
      return
    }
    const timestamp = frame.timestamp ?? new Date().toISOString()
    const previousStatus = this.state.mobileScreenShare.status
    const previousWidth = this.state.mobileScreenShare.width
    const previousHeight = this.state.mobileScreenShare.height
    const dimensionsChanged = previousWidth !== frame.width || previousHeight !== frame.height

    // Large base64 payload goes out over the dedicated frame channel only; it
    // is never placed into EngineState (which stays metadata-only).
    this.sendMobileFrame({
      sessionId: this.connected.sessionId,
      format: frame.format,
      width: frame.width,
      height: frame.height,
      data: frame.data,
      timestamp,
    })

    this.state.mobileScreenShare = {
      status: 'sharing',
      width: frame.width,
      height: frame.height,
      format: frame.format,
      data: null,
      lastFrameAt: timestamp,
    }
    this.mobileHasFrame = true
    if (previousWidth > 0 && dimensionsChanged) {
      this.addLog(`Desktop viewer metadata updated: ${previousWidth}x${previousHeight} -> ${frame.width}x${frame.height}`, 'Mobile', 'Info', false, this.connected.device.name)
      if (VERBOSE_PROTOCOL_LOGS) console.log(`[RemoteLink][mobile-screen] frame metadata updated ${previousWidth}x${previousHeight} -> ${frame.width}x${frame.height}`)
    }
    this.mobileScreenFrameCount += 1
    if (this.mobileScreenFrameCount === 1 || this.mobileScreenFrameCount % 30 === 0) {
      this.addLog(`mobile_screen_frame received and stored (${frame.width}x${frame.height})`, 'Mobile', 'Info', false, this.connected.device.name)
    }
    // Only broadcast EngineState on a real metadata change (first frame,
    // status transition, or resolution change) — not on every frame.
    if (previousStatus !== 'sharing' || dimensionsChanged) {
      this.emit()
    }
  }

  private handleMobileScreenStop(message: RemoteLinkMessage, payload?: MobileScreenStatusPayload) {
    if (!this.connected || message.sessionId !== this.connected.sessionId) {
      this.addLog('Rejected mobile_screen_stop from unapproved session', 'Security', 'Warning')
      return
    }
    const statusPayload = normalizeMobileScreenStatusPayload(payload, this.state.mobileScreenShare)
    if (!statusPayload) {
      this.addLog('Rejected malformed mobile_screen_stop message', 'Security', 'Warning', true, this.connected.device.name)
      return
    }
    this.state.mobileScreenShare = {
      status: 'stopped',
      width: 0,
      height: 0,
      format: 'unknown',
      data: null,
      lastFrameAt: null,
      error: undefined,
    }
    this.mobileScreenFrameCount = 0
    this.mobileHasFrame = false
    this.addLog(statusPayload.message ?? 'mobile_screen_stop received; mobile screen share stopped', 'Mobile', 'Info', true, this.connected.device.name)
    this.emit()
  }

  private startDiscoveryListener() {
    if (this.discoverySocket) return

    this.state.discoveryStatus = 'starting'
    this.state.discoveryError = undefined
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })
    this.discoverySocket = socket

    socket.on('error', (error) => {
      this.state.discoveryStatus = 'error'
      this.state.discoveryError = formatServerError(error)
      this.addLog(`Discovery listener error: ${this.state.discoveryError}`, 'System', 'Warning')
      this.stopDiscoveryListener(false)
    })

    socket.on('message', (buffer, remote) => {
      const request = parseDiscoveryRequest(buffer)
      if (!request) return
      this.addLog(`Discovery request received from ${redactIp(remote.address)}`, 'System', 'Info', false)
      const response = Buffer.from(JSON.stringify({
        type: REMOTELINK_DISCOVERY_RESPONSE,
        appName: 'RemoteLink Desktop',
        hostIp: this.state.hostIp === 'Local IP unavailable' ? undefined : this.state.hostIp,
        port: REMOTELINK_WS_PORT,
        engineActive: this.state.engineActive,
        serverStatus: this.state.serverStatus,
      }))
      socket.send(response, remote.port, remote.address, (error) => {
        if (error) {
          this.addLog(`Discovery response failed: ${formatServerError(error)}`, 'System', 'Warning', false)
          return
        }
        this.addLog(`Discovery response sent to ${redactIp(remote.address)}`, 'System', 'Info', false)
      })
    })

    socket.bind(REMOTELINK_DISCOVERY_PORT, '0.0.0.0', () => {
      try {
        socket.setBroadcast(true)
      } catch {
        // Some adapters disallow toggling broadcast; direct UDP replies still work.
      }
      this.addLog(`Discovery listener started on UDP 0.0.0.0:${REMOTELINK_DISCOVERY_PORT}`, 'System', 'Success')
      this.state.discoveryStatus = 'listening'
      this.state.discoveryError = undefined
      this.emit()
    })
  }

  private stopDiscoveryListener(setOffline = true) {
    const socket = this.discoverySocket
    if (!socket) {
      if (setOffline) {
        this.state.discoveryStatus = 'offline'
        this.state.discoveryError = undefined
      }
      return
    }
    this.discoverySocket = null
    try {
      socket.close()
    } catch {
      // Already closed.
    }
    if (setOffline) {
      this.state.discoveryStatus = 'offline'
      this.state.discoveryError = undefined
    }
  }

  private handleMobileScreenStatus(message: RemoteLinkMessage, payload?: MobileScreenStatusPayload) {
    if (!this.connected || message.sessionId !== this.connected.sessionId) {
      this.addLog('Rejected mobile_screen_status from unapproved session', 'Security', 'Warning')
      return
    }
    const statusPayload = normalizeMobileScreenStatusPayload(payload, this.state.mobileScreenShare)
    if (!statusPayload) {
      this.addLog('Rejected malformed mobile_screen_status message', 'Security', 'Warning', true, this.connected.device.name)
      return
    }
    if (this.isPreviewStreamActive() && (statusPayload.status === 'starting' || statusPayload.status === 'sharing')) {
      this.addLog('PC preview stopped for phone screen status', 'Mobile', 'Info', false, this.connected.device.name)
      this.stopPreviewStream('Phone screen share status received')
    }
    if (statusPayload.status === 'starting' || statusPayload.status === 'sharing') {
      this.mobileScreenStopRequested = false
    }
    const status = statusPayload.status
    const clearFrame = status === 'starting' || status === 'stopping' || status === 'stopped' || status === 'off' || status === 'error'
    this.state.mobileScreenShare = {
      status,
      width: statusPayload.width ?? (clearFrame ? 0 : this.state.mobileScreenShare.width),
      height: statusPayload.height ?? (clearFrame ? 0 : this.state.mobileScreenShare.height),
      format: clearFrame ? 'unknown' : this.state.mobileScreenShare.format,
      data: clearFrame ? null : this.state.mobileScreenShare.data,
      lastFrameAt: clearFrame ? null : statusPayload.lastFrameAt ?? this.state.mobileScreenShare.lastFrameAt,
      error: status === 'error' ? statusPayload.message : undefined,
    }
    if (clearFrame) {
      this.mobileScreenFrameCount = 0
      this.mobileHasFrame = false
    }
    this.addLog(`Mobile screen status: ${status}`, 'Mobile', 'Info', false, this.connected.device.name)
    this.emit()
  }

  private normalizeInputCommand(payload?: InputCommandPayload) {
    if (!payload || typeof payload.kind !== 'string') return null
    const kind = payload.kind as InputCommandKind

    switch (kind) {
      case 'mouse_move': {
        const dx = clampNumber(payload.dx, -1200, 1200)
        const dy = clampNumber(payload.dy, -1200, 1200)
        if (dx === null || dy === null) return null
        return { kind, dx, dy }
      }
      case 'mouse_click': {
        if (payload.button !== 'left' && payload.button !== 'right') return null
        return { kind, button: payload.button }
      }
      case 'mouse_down':
      case 'mouse_up': {
        if (payload.button !== 'left' && payload.button !== 'right') return null
        return { kind, button: payload.button }
      }
      case 'mouse_scroll': {
        const delta = clampNumber(payload.delta, -1200, 1200)
        if (delta === null || delta === 0) return null
        return { kind, delta }
      }
      case 'key_press':
      case 'modifier_down':
      case 'modifier_up':
      case 'function_key': {
        const key = normalizeInputKey(payload.key)
        if (!key || !isSupportedKey(key)) return null
        if (kind === 'modifier_down' || kind === 'modifier_up') {
          if (!isModifierKey(key)) return null
        }
        if (kind === 'function_key' && !/^f([1-9]|1[0-2])$/.test(key)) return null
        if (kind === 'key_press' && isModifierKey(key)) return null
        return { kind, key }
      }
      case 'type_text': {
        const text = typeof payload.text === 'string' ? payload.text : ''
        if (text.length === 0 || text.length > 512) return null
        return { kind, text }
      }
      case 'shortcut': {
        const keys = Array.isArray(payload.keys)
          ? payload.keys.map(normalizeInputKey).filter(Boolean)
          : []
        if (keys.length < 2 || keys.length > 4) return null
        if (!keys.every((key) => isShortcutKey(key))) return null
        return { kind, keys }
      }
      case 'release_all_modifiers':
        return { kind }
      default:
        return null
    }
  }

  private async executeInputCommand(command: ReturnType<RemoteLinkServer['normalizeInputCommand']>) {
    if (!command) return
    if (command.kind !== 'release_all_modifiers' && process.platform !== 'win32') {
      throw new Error('Remote input is supported only on Windows hosts')
    }
    switch (command.kind) {
      case 'mouse_move':
        await this.inputExecutor.mouseMove(command.dx, command.dy)
        return
      case 'mouse_click':
        await this.inputExecutor.mouseClick(command.button)
        return
      case 'mouse_down':
        this.heldMouseButtons.add(command.button)
        try {
          await this.inputExecutor.mouseButtonDown(command.button)
        } catch (error) {
          this.heldMouseButtons.delete(command.button)
          throw error
        }
        return
      case 'mouse_up':
        await this.flushPendingMouseMoveNow()
        try {
          await this.inputExecutor.mouseButtonUp(command.button)
        } finally {
          this.heldMouseButtons.delete(command.button)
        }
        return
      case 'mouse_scroll':
        await this.inputExecutor.mouseScroll(command.delta)
        return
      case 'key_press':
        await this.inputExecutor.keyPress(command.key)
        return
      case 'type_text':
        await this.inputExecutor.typeText(command.text)
        return
      case 'shortcut':
        await this.inputExecutor.shortcut(command.keys)
        return
      case 'modifier_down':
        this.heldModifiers.add(command.key)
        await this.inputExecutor.keyDown(command.key)
        return
      case 'modifier_up':
        this.heldModifiers.delete(command.key)
        await this.inputExecutor.keyUp(command.key)
        return
      case 'release_all_modifiers':
        await this.releaseAllModifiers('Released all modifiers from mobile', false)
        return
      case 'function_key':
        await this.inputExecutor.keyPress(command.key)
        return
    }
  }

  async releaseAllModifiers(reason = 'Released all modifiers', shouldLog = true) {
    this.heldModifiers.clear()
    this.state.heldModifiers = []
    try {
      await this.inputExecutor.releaseAllModifiers()
    } catch (error) {
      if (shouldLog) {
        if (VERBOSE_INPUT_LOGS) {
          const reasonText = error instanceof Error ? error.message : String(error)
          console.warn(`[RemoteLink][input] release modifiers failed: ${reasonText}`)
        }
        this.logInputFailure('remote', 'Remote input is temporarily unavailable.', this.connected?.device.name)
      }
    }
    if (shouldLog) {
      this.addLog(reason, 'Keyboard', 'Info', true, this.connected?.device.name)
    } else {
      this.emit()
    }
    return this.getState()
  }

  private syncHeldModifiers() {
    this.state.heldModifiers = [...this.heldModifiers]
  }

  private describeInputCommand(command: NonNullable<ReturnType<RemoteLinkServer['normalizeInputCommand']>>) {
    switch (command.kind) {
      case 'mouse_move':
        return `mouse_move dx=${command.dx} dy=${command.dy}`
      case 'mouse_click':
        return `${command.button}_click executed`
      case 'mouse_down':
        return `${command.button}_button_down`
      case 'mouse_up':
        return `${command.button}_button_up`
      case 'mouse_scroll':
        return `mouse_scroll delta=${command.delta}`
      case 'key_press':
        return `key_press ${command.key}`
      case 'type_text':
        return `type_text ${command.text.length} chars`
      case 'shortcut':
        return `shortcut ${command.keys.join('+')}`
      case 'modifier_down':
        return `modifier_down ${command.key}`
      case 'modifier_up':
        return `modifier_up ${command.key}`
      case 'release_all_modifiers':
        return 'release_all_modifiers executed'
      case 'function_key':
        return `function_key ${command.key}`
    }
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
      isPrimary: monitor.isPrimary,
      primary: monitor.isPrimary,
      width: monitor.bounds.width,
      height: monitor.bounds.height,
      scaleFactor: monitor.scaleFactor,
    }))
  }

  private monitorListPayload() {
    const monitors = this.protocolMonitors()
    return {
      monitors,
      detectedMonitors: monitors,
      selectedMonitorId: this.state.selectedMonitorId,
    }
  }

  private withActiveMonitor(monitors: EngineMonitor[], selectedMonitorId: string | null) {
    return monitors.map((monitor) => ({
      ...monitor,
      isActive: selectedMonitorId ? monitor.protocolId === selectedMonitorId : monitor.isPrimary,
    }))
  }

  refreshMonitors(reason = 'Display detection refreshed', shouldEmit = true) {
    let detected: EngineMonitor[] = []
    try {
      detected = this.detectMonitors()
    } catch (error) {
      this.addLog(`Monitor detection failed: ${error instanceof Error ? error.message : String(error)}`, 'Monitor', 'Error', shouldEmit)
      return this.getState()
    }

    const previousSelected = this.state.selectedMonitorId
    const selectedMonitorId = previousSelected && detected.some((monitor) => monitor.protocolId === previousSelected)
      ? previousSelected
      : detected.find((monitor) => monitor.isPrimary)?.protocolId ?? detected[0]?.protocolId ?? null
    this.state.selectedMonitorId = selectedMonitorId
    this.state.detectedMonitors = this.withActiveMonitor(detected, selectedMonitorId)
    if (this.state.previewStream.status !== 'stopped' && selectedMonitorId && this.state.previewStream.monitorId !== selectedMonitorId) {
      this.startPreviewStream(selectedMonitorId)
    } else if (this.state.previewStream.status !== 'stopped' && !selectedMonitorId) {
      this.stopPreviewStream('Selected monitor became unavailable')
    }
    this.addLog(`${reason}: ${detected.length} screen(s)`, 'Monitor', 'Info', false)
    if (this.connected?.ws.readyState === WebSocket.OPEN) {
      this.send(this.connected.ws, MessageType.MonitorList, this.monitorListPayload(), this.connected.device.deviceId, this.connected.sessionId)
      this.addLog(`Monitor list sent to mobile (${detected.length} screen(s))`, 'Monitor', 'Info', false, this.connected.device.name)
    }
    if (shouldEmit) this.emit()
    return this.getState()
  }

  private startPreviewStream(requestedMonitorId?: string | null) {
    if (!this.connected || this.connected.ws.readyState !== WebSocket.OPEN) {
      this.addLog('Preview stream rejected: no approved mobile client', 'Security', 'Warning')
      return
    }
    const monitorId = requestedMonitorId || this.state.selectedMonitorId
    const monitor = monitorId
      ? this.state.detectedMonitors.find((item) => item.protocolId === monitorId)
      : undefined
    if (!monitor) {
      this.state.previewStream = {
        status: 'error',
        monitorId: monitorId ?? null,
        fps: 0,
        lastFrameAt: null,
        error: 'Selected monitor is unavailable',
      }
      this.sendStreamStatus('error', 'Selected monitor is unavailable')
      this.addLog(`Preview stream rejected: invalid monitor ${monitorId ?? 'none'}`, 'Monitor', 'Warning')
      this.emit()
      return
    }

    if (this.streamTimer && this.state.previewStream.monitorId === monitor.protocolId) {
      this.sendStreamStatus(this.state.previewStream.status)
      return
    }

    this.stopPreviewStream('Switching preview monitor', false)
    this.state.selectedMonitorId = monitor.protocolId
    this.state.detectedMonitors = this.withActiveMonitor(this.state.detectedMonitors, monitor.protocolId)
    this.state.previewStream = {
      status: 'starting',
      monitorId: monitor.protocolId,
      fps: 0,
      lastFrameAt: null,
    }
    this.streamFrameCount = 0
    this.streamStartedAt = Date.now()
    this.sendStreamStatus('starting', `Starting preview for ${monitor.name}`)
    this.addLog(`Preview capture source selected: ${monitor.name}`, 'Monitor', 'Info', false, this.connected.device.name)
    this.addLog(`Preview stream started: ${monitor.name}`, 'Monitor', 'Success', true, this.connected.device.name)

    const tick = () => {
      void this.sendPreviewFrame()
    }
    tick()
    this.streamTimer = setInterval(tick, 125)
    this.emit()
  }

  private stopPreviewStream(reason = 'Preview stream stopped', shouldEmit = true) {
    if (this.streamTimer) clearInterval(this.streamTimer)
    this.streamTimer = null
    this.streamInFlight = false
    const wasRunning = this.state.previewStream.status !== 'stopped'
    this.state.previewStream = {
      status: 'stopped',
      monitorId: null,
      fps: 0,
      lastFrameAt: null,
    }
    if (this.connected?.ws.readyState === WebSocket.OPEN) {
      this.sendStreamStatus('stopped', reason)
    }
    if (wasRunning) this.addLog(`Preview stream stopped: ${reason}`, 'Monitor', 'Info', shouldEmit, this.connected?.device.name)
    else if (shouldEmit) this.emit()
  }

  private async sendPreviewFrame() {
    if (this.streamInFlight || !this.connected || this.connected.ws.readyState !== WebSocket.OPEN) return
    const monitorId = this.state.previewStream.monitorId
    const monitor = monitorId
      ? this.state.detectedMonitors.find((item) => item.protocolId === monitorId)
      : undefined
    if (!monitor) {
      this.stopPreviewStream('Selected monitor became unavailable')
      return
    }

    this.streamInFlight = true
    try {
      const frame = await this.captureFrame(monitor)
      if (!this.connected || this.connected.ws.readyState !== WebSocket.OPEN) return
      this.send(this.connected.ws, MessageType.ScreenFrame, frame, this.connected.device.deviceId, this.connected.sessionId)
      this.addLog(`Preview frame sent to mobile client (${monitor.name})`, 'Monitor', 'Info', false, this.connected.device.name)
      this.streamFrameCount += 1
      const elapsedSeconds = Math.max(1, (Date.now() - this.streamStartedAt) / 1000)
      this.state.previewStream = {
        status: 'active',
        monitorId: monitor.protocolId,
        fps: Math.round((this.streamFrameCount / elapsedSeconds) * 10) / 10,
        lastFrameAt: new Date().toISOString(),
      }
      this.sendStreamStatus('active')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.state.previewStream = {
        status: 'error',
        monitorId: monitor.protocolId,
        fps: 0,
        lastFrameAt: this.state.previewStream.lastFrameAt,
        error: message,
      }
      this.sendStreamStatus('error', message)
      this.addLog(`Preview frame send error: ${message}`, 'Monitor', 'Error')
      this.stopPreviewStream('Frame capture failed')
    } finally {
      this.streamInFlight = false
      this.emit()
    }
  }

  private sendStreamStatus(status: EngineState['previewStream']['status'], message?: string) {
    if (!this.connected || this.connected.ws.readyState !== WebSocket.OPEN) return
    this.send(this.connected.ws, MessageType.StreamStatus, {
      status,
      message,
      monitorId: this.state.previewStream.monitorId,
      fps: this.state.previewStream.fps,
      lastFrameAt: this.state.previewStream.lastFrameAt,
    }, this.connected.device.deviceId, this.connected.sessionId)
  }

  private sendMobileScreenStatus(status: EngineState['mobileScreenShare']['status'], reason: string) {
    if (!this.connected || this.connected.ws.readyState !== WebSocket.OPEN) return
    this.send(this.connected.ws, MessageType.MobileScreenStatus, {
      status,
      message: reason,
    }, this.connected.device.deviceId, this.connected.sessionId)
  }

  private sendMobileScreenStopped(reason: string) {
    this.sendMobileScreenStatus('stopped', reason)
  }

  private clearMobileScreenShare(reason: string) {
    const wasActive = this.state.mobileScreenShare.status !== 'off' ||
      this.mobileHasFrame
    this.state.mobileScreenShare = {
      status: 'off',
      width: 0,
      height: 0,
      format: 'unknown',
      data: null,
      lastFrameAt: null,
    }
    this.mobileScreenFrameCount = 0
    this.mobileHasFrame = false
    this.mobileScreenStopRequested = false
    if (wasActive) {
      this.addLog(`Mobile screen cleared: ${reason}`, 'Mobile', 'Info', false, this.connected?.device.name)
    }
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
      event: sanitizeLogText(event, MAX_LOG_EVENT_LENGTH),
      type,
      status,
      device: device ? sanitizeLogText(device, MAX_LOG_DEVICE_LENGTH) : undefined,
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
    this.stopDiscoveryListener()
    if (this.connected?.ws.readyState === WebSocket.OPEN) {
      this.sendMobileScreenStopped('Remote Engine error')
    }
    this.resetInputPipeline('Remote Engine error', true)
    this.pending = null
    this.connected = null
    void this.releaseAllModifiers('Remote Engine error')
    this.state.engineActive = false
    this.state.serverStatus = 'error'
    this.state.discoveryStatus = 'offline'
    this.state.discoveryError = undefined
    this.state.pendingRequest = null
    this.state.connectedDevice = null
    this.state.lastInputAt = null
    this.state.heldModifiers = []
    this.clearMobileScreenShare('Remote Engine error')
    this.state.error = formatServerError(error)
    console.error('[RemoteLink] Remote Engine server error:', error)
    this.addLog(`Remote Engine error: ${this.state.error}`, 'System', 'Error')
    this.emit()
  }
}

function detectLocalIPv4Candidates(): IpDetectionResult {
  const nodeCandidates = detectNodeIPv4Candidates()
  if (nodeCandidates.recommended.length > 0 || process.platform !== 'win32') {
    return nodeCandidates
  }

  const windowsCandidates = detectWindowsIPv4Candidates()
  if (windowsCandidates.recommended.length > 0) {
    return {
      recommended: windowsCandidates.recommended,
      fallback: uniqueStrings([...nodeCandidates.fallback, ...windowsCandidates.fallback]),
      detected: uniqueStrings([...nodeCandidates.detected, ...windowsCandidates.detected]),
      ignored: [...nodeCandidates.ignored, ...windowsCandidates.ignored],
      source: 'node+powershell',
    }
  }

  return {
    ...nodeCandidates,
    fallback: uniqueStrings([...nodeCandidates.fallback, ...windowsCandidates.fallback]),
    detected: uniqueStrings([...nodeCandidates.detected, ...windowsCandidates.detected]),
    ignored: [...nodeCandidates.ignored, ...windowsCandidates.ignored],
  }
}

function detectNodeIPv4Candidates(): IpDetectionResult {
  const networks = os.networkInterfaces()
  const candidates: IpCandidate[] = []
  const ignored: IpDetectionResult['ignored'] = []
  const detected: string[] = []

  for (const [name, entries] of Object.entries(networks)) {
    const adapterName = name
    for (const entry of entries ?? []) {
      if (entry.family !== 'IPv4') continue
      detected.push(`${adapterName} ${entry.address}`)
      const candidate = classifyIpCandidate(entry.address, adapterName, {
        active: !entry.internal,
      })
      if (candidate.ignoredReason) {
        ignored.push({ address: candidate.address, adapterName, reason: candidate.ignoredReason })
      } else {
        candidates.push(candidate)
      }
    }
  }

  const sorted = uniqueCandidates(candidates)
    .sort((a, b) => b.score - a.score || a.address.localeCompare(b.address))
  return {
    recommended: sorted.map((candidate) => candidate.address),
    fallback: ignored
      .filter(isAdvancedFallback)
      .map((item) => item.address),
    detected,
    ignored,
    source: 'node',
  }
}

function detectWindowsIPv4Candidates(): IpDetectionResult {
  try {
    const script = [
      '$items = Get-NetIPConfiguration | ForEach-Object {',
      '  foreach ($addr in $_.IPv4Address) {',
      '    [PSCustomObject]@{',
      '      Address = $addr.IPAddress',
      '      Alias = $_.InterfaceAlias',
      '      Description = $_.InterfaceDescription',
      '      HasGateway = [bool]$_.IPv4DefaultGateway',
      '      Status = (Get-NetAdapter -InterfaceIndex $_.InterfaceIndex -ErrorAction SilentlyContinue).Status',
      '    }',
      '  }',
      '}',
      '$items | ConvertTo-Json -Compress',
    ].join('\n')
    const raw = execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
      encoding: 'utf8',
      timeout: 800,
      windowsHide: true,
    }).trim()
    if (!raw) return emptyDetection('powershell')

    const parsed = JSON.parse(raw)
    const rows = Array.isArray(parsed) ? parsed : [parsed]
    const realRows = rows.filter((row: any) => {
      const address = String(row.Address ?? '')
      const adapterText = `${row.Alias ?? ''} ${row.Description ?? ''}`
      return isPairablePrivateIPv4(address) && !isVirtualAdapter(adapterText)
    })
    const hasRealGateway = realRows.some((row: any) => row.HasGateway === true)
    const ignored: IpDetectionResult['ignored'] = []
    const detected: string[] = []
    const candidates = rows
      .map((row: any) => {
        const address = String(row.Address ?? '')
        const adapterName = `${row.Alias ?? ''}`.trim() || `${row.Description ?? ''}`.trim() || 'Unknown adapter'
        const status = String(row.Status ?? '')
        detected.push(`${adapterName} ${address}`)
        return classifyIpCandidate(address, adapterName, {
          hasGateway: row.HasGateway === true,
          active: status.toLowerCase() === 'up',
          ignoreNoGateway: hasRealGateway,
        })
      })
      .filter((candidate) => {
        if (candidate.ignoredReason) {
          ignored.push({
            address: candidate.address,
            adapterName: candidate.adapterName,
            reason: candidate.ignoredReason,
          })
          return false
        }
        return true
      })
      .sort((a, b) => b.score - a.score || a.address.localeCompare(b.address))

    return {
      recommended: uniqueStrings(candidates.map((candidate) => candidate.address)),
      fallback: uniqueStrings(ignored
        .filter(isAdvancedFallback)
        .map((item) => item.address)),
      detected,
      ignored,
      source: 'powershell',
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      ...emptyDetection('powershell'),
      ignored: [{ address: 'PowerShell', adapterName: 'Get-NetIPConfiguration', reason: `optional detection skipped: ${message}` }],
    }
  }
}

function classifyIpCandidate(
  address: string,
  adapterName: string,
  options: { hasGateway?: boolean; active?: boolean; ignoreNoGateway?: boolean } = {},
): IpCandidate {
  const normalized = normalizeIp(address)
  const adapterText = adapterName.toLowerCase()
  const ignoredReason = ignoredIpReason(normalized, adapterText, options)
  if (ignoredReason) {
    return { address: normalized, adapterName, score: 0, ignoredReason }
  }

  let score = 0
  if (/wi-?fi|wireless|wlan|hotspot/i.test(adapterText)) score += 400
  else if (/ethernet|lan/i.test(adapterText)) score += 300
  else score += 100
  if (options.hasGateway) score += 200
  if (options.active) score += 80
  if (normalized.startsWith('10.')) score += 40
  else if (normalized.startsWith('192.168.')) score += 30
  else if (is172Private(normalized)) score += 20

  return {
    address: normalized,
    adapterName,
    score,
    hasGateway: options.hasGateway,
    active: options.active,
  }
}

function ignoredIpReason(
  address: string,
  adapterText: string,
  options: { hasGateway?: boolean; active?: boolean; ignoreNoGateway?: boolean },
) {
  if (!address) return 'missing IPv4 address'
  if (address === '127.0.0.1' || address.startsWith('127.')) return 'localhost is not reachable from phone'
  if (address.startsWith('169.254.')) return 'link-local address is not phone-pairable'
  if (address.startsWith('192.168.56.')) return 'Virtual adapter - not for phone pairing'
  if (!isPairablePrivateIPv4(address)) return 'not a private LAN/hotspot IPv4 address'
  if (isVirtualAdapter(adapterText)) return 'Virtual adapter - not for phone pairing'
  if (options.active === false) return 'adapter is disconnected'
  if (options.ignoreNoGateway && !options.hasGateway) return 'adapter has no default gateway'
  return undefined
}

function normalizeIp(ip: string) {
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip
}

function generatePairingCode() {
  return crypto.randomInt(100000, 1000000).toString()
}

function emptyDetection(source: IpDetectionResult['source']): IpDetectionResult {
  return {
    recommended: [],
    fallback: [],
    detected: [],
    ignored: [],
    source,
  }
}

function uniqueCandidates(candidates: IpCandidate[]) {
  const seen = new Set<string>()
  return candidates.filter((candidate) => {
    if (seen.has(candidate.address)) return false
    seen.add(candidate.address)
    return true
  })
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))]
}

function isAdvancedFallback(item: { address: string; reason: string }) {
  return item.reason.includes('Virtual adapter') &&
    (item.address.startsWith('192.168.56.') || isPairablePrivateIPv4(item.address))
}

function isPairablePrivateIPv4(address: string) {
  return address.startsWith('10.') ||
    (address.startsWith('192.168.') && !address.startsWith('192.168.56.')) ||
    is172Private(address)
}

function isVirtualAdapter(adapterName: string) {
  return /virtualbox|host-only|vmware|hyper-v|wsl|docker|loopback|bluetooth|teredo|vethernet|virtual|tap|npcap/i.test(adapterName)
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

function clampNumber(value: unknown, min: number, max: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.trunc(Math.max(min, Math.min(max, value)))
}

function clampInputDelta(value: number) {
  return Math.trunc(Math.max(-1200, Math.min(1200, value)))
}

function normalizeBoundedString(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (!text || text.length > maxLength) return null
  return text
}

function normalizePairingRequest(payload?: PairingRequestPayload): PairingRequestPayload | null {
  if (!payload || typeof payload !== 'object') return null
  const deviceName = normalizeBoundedString(payload.deviceName, 80)
  const deviceId = normalizeBoundedString(payload.deviceId, 96)
  const pairingCode = normalizeBoundedString(payload.pairingCode, 12)
  const appVersion = normalizeBoundedString(payload.appVersion, 32) ?? 'unknown'
  if (!deviceName || !deviceId || !/^\d{6}$/.test(pairingCode ?? '')) return null
  return { deviceName, deviceId, pairingCode: pairingCode!, appVersion }
}

function normalizeOptionalMonitorId(value: unknown) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || value.length > 80) return null
  return value
}

function normalizeMobileScreenFramePayload(payload?: MobileScreenFramePayload): MobileScreenFramePayload | null {
  if (!payload || typeof payload !== 'object') return null
  if (payload.format !== 'jpeg') return null
  const width = clampNumber(payload.width, 1, MAX_MOBILE_FRAME_WIDTH)
  const height = clampNumber(payload.height, 1, MAX_MOBILE_FRAME_HEIGHT)
  const data = typeof payload.data === 'string' ? payload.data : ''
  if (width === null || height === null) return null
  if (!data || data.length > MAX_MOBILE_FRAME_BASE64_CHARS || data.length % 4 !== 0) return null
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return null
  const timestamp = normalizeIsoTimestamp(payload.timestamp)
  if (payload.timestamp !== undefined && !timestamp) return null
  return {
    format: 'jpeg',
    width,
    height,
    data,
    ...(timestamp ? { timestamp } : {}),
  }
}

function describeMobileScreenFrameRejectReason(payload?: MobileScreenFramePayload) {
  if (!payload || typeof payload !== 'object') return 'payload missing or not an object'
  if (payload.format !== 'jpeg') return 'format must be jpeg'
  const width = clampNumber(payload.width, 1, MAX_MOBILE_FRAME_WIDTH)
  const height = clampNumber(payload.height, 1, MAX_MOBILE_FRAME_HEIGHT)
  if (width === null) return `width must be 1-${MAX_MOBILE_FRAME_WIDTH}`
  if (height === null) return `height must be 1-${MAX_MOBILE_FRAME_HEIGHT}`
  const data = typeof payload.data === 'string' ? payload.data : ''
  if (!data) return 'base64 image data is missing'
  if (data.length > MAX_MOBILE_FRAME_BASE64_CHARS) return `base64 image data exceeds ${MAX_MOBILE_FRAME_BASE64_CHARS} chars`
  if (data.length % 4 !== 0) return 'base64 image data has invalid padding length'
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return 'base64 image data contains invalid characters'
  if (payload.timestamp !== undefined && !normalizeIsoTimestamp(payload.timestamp)) return 'timestamp is invalid'
  return 'unknown validation failure'
}

function normalizeMobileScreenStatusPayload(
  payload: MobileScreenStatusPayload | undefined,
  current: EngineState['mobileScreenShare'],
): MobileScreenStatusPayload | null {
  const allowed = new Set(['off', 'stopped', 'starting', 'sharing', 'stopping', 'error'])
  const status = payload?.status ?? current.status ?? 'off'
  if (!allowed.has(status)) return null
  const width = payload?.width === undefined ? undefined : clampNumber(payload.width, 1, MAX_MOBILE_FRAME_WIDTH)
  const height = payload?.height === undefined ? undefined : clampNumber(payload.height, 1, MAX_MOBILE_FRAME_HEIGHT)
  const fps = payload?.fps === undefined ? undefined : clampNumber(payload.fps, 1, 30)
  if (width === null || height === null || fps === null) return null
  const normalizedLastFrameAt = payload?.lastFrameAt === undefined ? undefined : normalizeIsoTimestamp(payload.lastFrameAt)
  if (payload?.lastFrameAt !== undefined && !normalizedLastFrameAt) return null
  const lastFrameAt = normalizedLastFrameAt ?? undefined
  const message = payload?.message === undefined ? undefined : truncate(String(payload.message), 160)
  return { status: status as MobileScreenStatusPayload['status'], message, width, height, fps, lastFrameAt }
}

function normalizeIsoTimestamp(value: unknown) {
  if (typeof value !== 'string' || value.length > 48) return null
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return null
  return new Date(parsed).toISOString()
}

function parseMessageTimestampMs(value: unknown) {
  if (typeof value !== 'string' || value.length > 48) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function parseDiscoveryRequest(buffer: Buffer) {
  if (buffer.length > 1024) return false
  try {
    const parsed = JSON.parse(buffer.toString('utf8'))
    return Boolean(parsed && typeof parsed === 'object' && parsed.type === REMOTELINK_DISCOVERY_REQUEST)
  } catch {
    return false
  }
}

function normalizeInputKey(value: unknown) {
  if (typeof value !== 'string') return ''
  const normalized = value.trim().toLowerCase()
  if (normalized === 'esc') return 'escape'
  if (normalized === 'del') return 'delete'
  if (normalized === 'back') return 'backspace'
  if (normalized === 'control') return 'ctrl'
  if (normalized === 'meta' || normalized === 'super') return 'win'
  return normalized
}

function isModifierKey(key: string) {
  return key === 'ctrl' || key === 'alt' || key === 'shift' || key === 'win'
}

function isShortcutKey(key: string) {
  return isModifierKey(key) ||
    key === 'tab' ||
    key === 'escape' ||
    key === 'backspace' ||
    key === 'delete' ||
    key === 'enter' ||
    /^f([1-9]|1[0-2])$/.test(key) ||
    /^[a-z0-9]$/.test(key)
}

function isSupportedKey(key: string) {
  return isShortcutKey(key)
}

function inputCommandLogType(kind: InputCommandKind): EngineLogItem['type'] {
  if (kind === 'mouse_move' || kind === 'mouse_click' || kind === 'mouse_down' || kind === 'mouse_up' || kind === 'mouse_scroll') return 'Mouse'
  if (kind === 'key_press' || kind === 'type_text' || kind === 'shortcut' || kind === 'modifier_down' || kind === 'modifier_up' || kind === 'release_all_modifiers' || kind === 'function_key') return 'Keyboard'
  return 'Mobile'
}

function parseMessage(raw: string): RemoteLinkMessage | null {
  try {
    if (raw.length > MAX_WS_MESSAGE_BYTES) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    if (typeof parsed.type !== 'string' || parsed.type.length > 64) return null
    if (parsed.payload !== undefined && (typeof parsed.payload !== 'object' || parsed.payload === null || Array.isArray(parsed.payload))) return null
    if (parsed.sessionId !== undefined && typeof parsed.sessionId !== 'string') return null
    if (parsed.deviceId !== undefined && typeof parsed.deviceId !== 'string') return null
    return parsed
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

function messageByteLength(data: unknown) {
  if (typeof data === 'string') return Buffer.byteLength(data, 'utf8')
  if (Buffer.isBuffer(data)) return data.length
  if (data instanceof ArrayBuffer) return data.byteLength
  if (Array.isArray(data)) return data.reduce((sum, item) => sum + messageByteLength(item), 0)
  return Buffer.byteLength(String(data), 'utf8')
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function truncate(value: string, maxLength: number) {
  return value.length <= maxLength ? value : `${value.slice(0, Math.max(0, maxLength - 1))}…`
}

function sanitizeLogText(value: string, maxLength: number) {
  return truncate(value.replace(/\b\d{6}\b/g, '[pairing-code]').replace(/\s+/g, ' ').trim(), maxLength)
}

function redactIp(ip: string) {
  const parts = normalizeIp(ip).split('.')
  if (parts.length !== 4) return 'local-client'
  return `${parts[0]}.${parts[1]}.${parts[2]}.x`
}

function redactDeviceId(value: unknown) {
  if (typeof value !== 'string' || value.length <= 8) return '***'
  return `${value.slice(0, 4)}...${value.slice(-4)}`
}

function protocolLog(message: string, verbose = false) {
  if (verbose && !VERBOSE_PROTOCOL_LOGS) return
  console.log(`[RemoteLink][pairing] ${message}`)
}

function sanitizeCommandLog(payload: CommandLogPayload) {
  const command = truncate(payload.command, 48)
  if (!payload.details || typeof payload.details !== 'object') return command
  if (payload.command === 'text' || 'text' in payload.details) {
    const length = typeof payload.details.text === 'string' ? payload.details.text.length : 0
    return `${command} (${length} chars)`
  }
  const keys = Object.keys(payload.details).filter((key) => key !== 'data').slice(0, 6)
  return keys.length > 0 ? `${command} details=${keys.join(',')}` : command
}


