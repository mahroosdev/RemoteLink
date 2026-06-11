export const REMOTELINK_PROTOCOL_VERSION = '1.0.0';
export const REMOTELINK_WS_PORT = 47777;

export const MessageType = {
  PairingRequest: 'pairing_request',
  PairingPending: 'pairing_pending',
  PairingApproved: 'pairing_approved',
  PairingDenied: 'pairing_denied',
  Heartbeat: 'heartbeat',
  MonitorList: 'monitor_list',
  CommandLog: 'command_log',
  Disconnect: 'disconnect',
  Error: 'error',
} as const;

export type RemoteLinkMessageType = typeof MessageType[keyof typeof MessageType];

export interface RemoteLinkMonitor {
  id: string;
  label: string;
  primary: boolean;
}

export interface PairingRequestPayload {
  deviceName: string;
  deviceId: string;
  pairingCode: string;
  appVersion: string;
}

export interface PairingApprovedPayload {
  sessionId: string;
  hostName: string;
  detectedMonitors: RemoteLinkMonitor[];
}

export interface CommandLogPayload {
  command: string;
  details: Record<string, unknown>;
}

export interface RemoteLinkMessage<TPayload = unknown> {
  type: RemoteLinkMessageType;
  timestamp: string;
  deviceId?: string;
  sessionId?: string;
  payload?: TPayload;
}

export type PairingRequestMessage = RemoteLinkMessage<PairingRequestPayload>;
export type PairingApprovedMessage = RemoteLinkMessage<PairingApprovedPayload>;
export type CommandLogMessage = RemoteLinkMessage<CommandLogPayload>;
