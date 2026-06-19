export const REMOTELINK_WS_PORT = 47777;

export const MessageType = {
  PairingRequest: 'pairing_request',
  PairingPending: 'pairing_pending',
  PairingApproved: 'pairing_approved',
  PairingDenied: 'pairing_denied',
  Heartbeat: 'heartbeat',
  MonitorList: 'monitor_list',
  SelectMonitor: 'select_monitor',
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

export interface RemoteLinkMessage<TPayload = unknown> {
  type: string;
  timestamp: string;
  deviceId?: string;
  sessionId?: string;
  payload?: TPayload;
}
