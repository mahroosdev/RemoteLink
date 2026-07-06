import { useState, useEffect } from 'react';

export interface DeviceInfo {
  name: string;
  os: string;
  status: 'Connected' | 'Disconnected' | 'Connecting' | 'Requesting';
  lastSeen: string;
  ip: string;
}

export interface LogItem {
  id: string;
  event: string;
  type: 'Pairing' | 'Monitor' | 'Keyboard' | 'Mouse' | 'Mobile' | 'System' | 'Security';
  timestamp: string;
  device?: string;
  status: 'Success' | 'Warning' | 'Error' | 'Info';
}

export interface MonitorInfo {
  id: number;
  name: string;
  resolution: string;
  refreshRate: string;
  isPrimary: boolean;
  isActive: boolean;
  quality: string;
  fps: number;
  sourceId?: string;
  protocolId?: string;
  bounds?: { x: number; y: number; width: number; height: number };
  scaleFactor?: number;
}

export interface PendingPairingRequest {
  deviceName: string;
  deviceId: string;
  appVersion: string;
  ip: string;
  requestedAt: string;
}

export interface EngineState {
  engineActive: boolean;
  serverStatus: 'offline' | 'starting' | 'listening' | 'error';
  discoveryStatus: 'offline' | 'starting' | 'listening' | 'error';
  hostIp: string;
  hostIpCandidates: string[];
  hostIpFallbacks: string[];
  port: number;
  pairingCode: string;
  pendingRequest: PendingPairingRequest | null;
  connectedDevice: (DeviceInfo & { deviceId?: string; appVersion?: string }) | null;
  detectedMonitors: MonitorInfo[];
  selectedMonitorId: string | null;
  previewStream: {
    status: 'stopped' | 'starting' | 'active' | 'error';
    monitorId: string | null;
    fps: number;
    lastFrameAt: string | null;
    error?: string;
  };
  mobileScreenShare: {
    status: 'off' | 'stopped' | 'starting' | 'sharing' | 'stopping' | 'error';
    width: number;
    height: number;
    format: 'jpeg' | 'unknown';
    data: string | null;
    lastFrameAt: string | null;
    error?: string;
  };
  activityLog: LogItem[];
  lastInputAt: string | null;
  inputStatus: 'idle' | 'starting' | 'ready' | 'fallback' | 'unavailable';
  heldModifiers: string[];
  error?: string;
  discoveryError?: string;
}

export interface FirewallRuleSummary {
  displayName: string;
  program: string;
}

export interface FirewallStatus {
  platform: string;
  supported: boolean;
  appPath: string;
  appName: string;
  packaged: boolean;
  tcpRuleName: string;
  udpRuleName: string;
  hasScopedTcpAllow: boolean;
  hasScopedUdpAllow: boolean;
  hasEnabledBlockRules: boolean;
  blockRules: FirewallRuleSummary[];
  checkedAt: string;
  error?: string;
}

export interface FirewallRepairResult {
  ok: boolean;
  message: string;
  status: FirewallStatus;
}

// Phone screen frame delivered over a dedicated IPC channel (kept out of
// EngineState so the large base64 payload does not trigger app-wide re-renders).
export interface MobileScreenFrame {
  sessionId: string;
  format: 'jpeg';
  width: number;
  height: number;
  data: string;
  timestamp: string;
}

export type AppTheme = 'Professional Dark' | 'Pure Black' | 'Light';

export interface AppSettings {
  general: {
    startWithWindows: boolean;
    minimizeToTray: boolean;
    theme: AppTheme;
    language: string;
    notifications: boolean;
  };
  connection: {
    autoReconnect: boolean;
    approvalMode: 'Ask Every Time' | 'Trusted Devices Only' | 'Manual Approval';
    nearbyMode: boolean;
  };
  controls: {
    mouseSensitivity: number;
    touchpadMode: 'Virtual Trackpad' | 'Direct Touch';
    scrollSpeed: number;
    longPressDuration: number;
    clickBehavior: 'Tap = Left, 2 Fingers = Right' | 'Classic';
    vibrationFeedback: boolean;
  };
  shortcuts: {
    stickyModifiers: boolean;
    quickActions: boolean;
    altTabSupport: boolean;
    fKeysEnabled: boolean;
  };
  monitors: {
    defaultMonitor: number;
    autoDetect: boolean;
    showOnlyConnected: boolean;
  };
  performance: {
    streamQuality: 'High (1080p)' | 'Balanced (720p)' | 'Performance (480p)';
    fps: 15 | 30 | 60;
    lowLatencyMode: boolean;
    bitrate: number;
    adaptiveQuality: boolean;
  };
  security: {
    requireApproval: boolean;
    showIndicator: boolean;
    sessionTimeout: 'Never' | '15 Minutes' | '1 Hour';
  };
}

export const defaultSettings: AppSettings = {
  general: { startWithWindows: true, minimizeToTray: true, theme: 'Professional Dark', language: 'English', notifications: true },
  connection: { autoReconnect: true, approvalMode: 'Ask Every Time', nearbyMode: true },
  controls: { mouseSensitivity: 50, touchpadMode: 'Virtual Trackpad', scrollSpeed: 40, longPressDuration: 500, clickBehavior: 'Tap = Left, 2 Fingers = Right', vibrationFeedback: true },
  shortcuts: { stickyModifiers: true, quickActions: true, altTabSupport: true, fKeysEnabled: true },
  monitors: { defaultMonitor: 1, autoDetect: true, showOnlyConnected: true },
  performance: { streamQuality: 'High (1080p)', fps: 60, lowLatencyMode: true, bitrate: 5, adaptiveQuality: true },
  security: { requireApproval: true, showIndicator: true, sessionTimeout: 'Never' }
};

// Global type for Electron API
declare global {
  interface Window {
    electronAPI: {
      getDesktopSources: () => Promise<any[]>;
    };
    remotelink: {
      getEngineState: () => Promise<EngineState>;
      startEngine: () => Promise<EngineState>;
      stopEngine: () => Promise<EngineState>;
      regeneratePairingCode: () => Promise<EngineState>;
      approvePairing: () => Promise<EngineState>;
      denyPairing: () => Promise<EngineState>;
      disconnectDevice: () => Promise<EngineState>;
      clearActivityLog: () => Promise<EngineState>;
      releaseAllKeys: () => Promise<EngineState>;
      stopPhoneScreenShare: () => Promise<EngineState>;
      copyText: (text: string) => Promise<{ ok: boolean }>;
      getFirewallStatus: (force?: boolean) => Promise<FirewallStatus>;
      repairLocalFirewall: () => Promise<FirewallRepairResult>;
      onEngineStateChanged: (callback: (state: EngineState) => void) => () => void;
      onMobileScreenFrame: (callback: (frame: MobileScreenFrame) => void) => () => void;
    };
  }
}



