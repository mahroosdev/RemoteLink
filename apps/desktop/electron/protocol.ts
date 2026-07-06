export const REMOTELINK_WS_PORT = 47777;
export const REMOTELINK_DISCOVERY_PORT = 47778;
export const REMOTELINK_DISCOVERY_REQUEST = 'remotelink_discovery_v1';
export const REMOTELINK_DISCOVERY_RESPONSE = 'remotelink_discovery_response_v1';

export const MessageType = {
  PairingRequest: 'pairing_request',
  PairingPending: 'pairing_pending',
  PairingApproved: 'pairing_approved',
  PairingDenied: 'pairing_denied',
  Heartbeat: 'heartbeat',
  MonitorList: 'monitor_list',
  SelectMonitor: 'select_monitor',
  StartStream: 'start_stream',
  StopStream: 'stop_stream',
  StreamStatus: 'stream_status',
  ScreenFrame: 'screen_frame',
  MobileScreenStart: 'mobile_screen_start',
  MobileScreenStarted: 'mobile_screen_started',
  MobileScreenFrame: 'mobile_screen_frame',
  MobileScreenStop: 'mobile_screen_stop',
  MobileScreenStatus: 'mobile_screen_status',
  InputCommand: 'input_command',
  CommandLog: 'command_log',
  Disconnect: 'disconnect',
  Error: 'error',
} as const;

export interface RemoteLinkMonitor {
  id: string;
  label: string;
  isPrimary: boolean;
  primary?: boolean;
  width: number;
  height: number;
  scaleFactor: number;
}

export interface SelectMonitorPayload {
  monitorId: string;
}

export interface StartStreamPayload {
  monitorId?: string;
}

export interface ScreenFramePayload {
  monitorId: string;
  format: 'jpeg';
  width: number;
  height: number;
  data: string;
  cursorX?: number;
  cursorY?: number;
  cursorVisible?: boolean;
}

export interface MobileScreenFramePayload {
  format: 'jpeg';
  width: number;
  height: number;
  data: string;
  timestamp?: string;
}

// Phone screen frame delivered to the desktop renderer over a dedicated IPC
// channel so the large base64 payload never travels inside EngineState.
export interface MobileScreenFrameBroadcast {
  sessionId: string;
  format: 'jpeg';
  width: number;
  height: number;
  data: string;
  timestamp: string;
}

export interface MobileScreenStatusPayload {
  status: 'off' | 'stopped' | 'starting' | 'sharing' | 'stopping' | 'error';
  message?: string;
  width?: number;
  height?: number;
  fps?: number;
  lastFrameAt?: string;
}

export interface PairingRequestPayload {
  deviceName: string;
  deviceId: string;
  pairingCode: string;
  appVersion: string;
}

export interface CommandLogPayload {
  command: string;
  details: Record<string, unknown>;
}

export type InputCommandKind =
  | 'mouse_move'
  | 'mouse_click'
  | 'mouse_down'
  | 'mouse_up'
  | 'mouse_scroll'
  | 'key_press'
  | 'type_text'
  | 'shortcut'
  | 'modifier_down'
  | 'modifier_up'
  | 'release_all_modifiers'
  | 'function_key';

export interface InputCommandPayload {
  kind: InputCommandKind;
  dx?: number;
  dy?: number;
  button?: 'left' | 'right';
  delta?: number;
  key?: string;
  text?: string;
  keys?: string[];
}

export interface RemoteLinkMessage<TPayload = unknown> {
  type: string;
  timestamp: string;
  deviceId?: string;
  sessionId?: string;
  payload?: TPayload;
}
