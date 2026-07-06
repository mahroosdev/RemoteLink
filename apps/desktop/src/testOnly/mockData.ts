import { LogItem, MonitorInfo } from '../state/appState';

// Test-only fixtures. Do not import from runtime UI.
export const initialLogs: LogItem[] = [];

export const mockMonitors: MonitorInfo[] = [
  { id: 1, name: 'Screen 1', resolution: '1920 x 1080', refreshRate: '60Hz', isPrimary: true, isActive: true, quality: 'High', fps: 60 },
  { id: 2, name: 'Screen 2', resolution: '2560 x 1440', refreshRate: '144Hz', isPrimary: false, isActive: false, quality: 'High', fps: 60 }
];
