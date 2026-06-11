import { DeviceInfo, LogItem, MonitorInfo } from '../state/appState';

// Demo device used only by the explicit "Simulate pairing request (demo)"
// flow. The app boots Disconnected — no fake connected state. Real pairing
// will replace this with the actually connected device.
export const mockConnectedDevice: DeviceInfo = {
  name: 'Demo Android Device',
  os: 'Android 13 / Device OS',
  status: 'Disconnected',
  lastSeen: 'Never',
  ip: '192.168.0.101'
};

// No fabricated history — the activity log fills from real runtime actions.
export const initialLogs: LogItem[] = [];

export const mockMonitors: MonitorInfo[] = [
  { id: 1, name: 'Screen 1', resolution: '1920 x 1080', refreshRate: '60Hz', isPrimary: true, isActive: true, quality: 'High', fps: 60 },
  { id: 2, name: 'Screen 2', resolution: '2560 x 1440', refreshRate: '144Hz', isPrimary: false, isActive: false, quality: 'High', fps: 60 }
];
