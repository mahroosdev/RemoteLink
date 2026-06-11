import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';

// Pages
import OverviewPage from './pages/OverviewPage';
import PairingDevicesPage from './pages/PairingDevicesPage';
import MonitorsPage from './pages/MonitorsPage';
import MobileControlPage from './pages/MobileControlPage';
import SessionsActivityPage from './pages/SessionsActivityPage';
import SettingsGuidePage from './pages/SettingsGuidePage';
import ManualPage from './pages/ManualPage';

// Data & State
import { DeviceInfo, LogItem, MonitorInfo, AppSettings, defaultSettings } from './state/appState';
import { mockConnectedDevice, initialLogs, mockMonitors } from './data/mockData';

function App() {
  // Navigation State
  const [activeTab, setActiveTab] = useState('Overview');
  const [settingsTab, setSettingsTab] = useState('General');

  // App State
  // Real local IP detection is not implemented yet — show a placeholder
  // instead of a hardcoded address. The engine/pairing layer will replace
  // this with the actually detected local IP.
  const [localIP] = useState('Detecting...');
  const [pairingCode, setPairingCode] = useState('731 942');
  const [pairingExpiry] = useState(60);
  const [connectedDevice, setConnectedDevice] = useState<DeviceInfo>(mockConnectedDevice);
  const [trustedDevices, setTrustedDevices] = useState<DeviceInfo[]>([]);
  const [logs, setLogs] = useState<LogItem[]>(initialLogs);
  const [monitors, setMonitors] = useState<MonitorInfo[]>(mockMonitors);
  const [engineActive, setEngineActive] = useState(false);
  const [previewActive, setPreviewActive] = useState(false);
  const [mobileRotation, setMobileRotation] = useState(0); // 0 = portrait, 90 = landscape

  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('remotelink_settings');
    return saved ? JSON.parse(saved) : defaultSettings;
  });

  // Theme Application
  useEffect(() => {
    const root = window.document.documentElement;
    const theme = settings.general.theme;
    
    if (theme === 'Pure Black') {
      root.setAttribute('data-theme', 'pure-black');
    } else if (theme === 'Light') {
      root.setAttribute('data-theme', 'light');
    } else if (theme === 'System Default') {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.setAttribute('data-theme', isDark ? 'dark' : 'light');
    } else {
      root.removeAttribute('data-theme'); // Default "Professional Dark"
    }
    
    localStorage.setItem('remotelink_settings', JSON.stringify(settings));
  }, [settings]);

  // Actions
  const addLog = (event: string, type: LogItem['type'], status: LogItem['status'] = 'Info') => {
    const newLog: LogItem = {
      id: Math.random().toString(36).substr(2, 9),
      event,
      type,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      device: connectedDevice.status === 'Connected' ? connectedDevice.name : undefined,
      status
    };
    setLogs(prev => [newLog, ...prev]);
  };

  const onAction = (type: string, payload?: any) => {
    switch (type) {
      case 'NAV':
        setActiveTab(payload);
        break;
      case 'TOGGLE_ENGINE':
        const newState = !engineActive;
        setEngineActive(newState);
        if (!newState) {
           setPreviewActive(false);
           setConnectedDevice(prev => ({ ...prev, status: 'Disconnected' }));
        } else {
           setConnectedDevice(prev => ({ ...prev, status: 'Disconnected' }));
        }
        addLog(`Engine Core: ${newState ? 'Initialized' : 'Terminated'}`, 'System', newState ? 'Success' : 'Info');
        break;
      case 'TOGGLE_PREVIEW':
        if (!engineActive) return;
        const newPrev = !previewActive;
        setPreviewActive(newPrev);
        addLog(`Monitor Broadcast: ${newPrev ? 'Active' : 'Standby'}`, 'Monitor');
        break;
      case 'REGEN_CODE':
        const newCode = Math.floor(100000 + Math.random() * 900000).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
        setPairingCode(newCode);
        addLog('Handshake Token Regenerated', 'Pairing');
        break;
      case 'APPROVE':
        setConnectedDevice(prev => ({ ...prev, status: 'Connected' }));
        setTrustedDevices(prev => [...prev, { ...connectedDevice, status: 'Connected', lastSeen: 'Active Now' }]);
        addLog('Mobile Authorization: APPROVED', 'Pairing', 'Success');
        setActiveTab('Overview');
        break;
      case 'DENY':
        setConnectedDevice(prev => ({ ...prev, status: 'Disconnected' }));
        addLog('Mobile Authorization: DENIED', 'Pairing', 'Warning');
        break;
      case 'DISCONNECT':
        setConnectedDevice(prev => ({ ...prev, status: 'Disconnected' }));
        setPreviewActive(false);
        addLog('Session Terminated by Host', 'System', 'Info');
        break;
      case 'SWITCH_MONITOR':
        setMonitors(prev => prev.map(m => ({ ...m, isActive: m.id === payload })));
        addLog(`Stream target: ${payload === 1 ? 'Display 1' : 'Display 2'}`, 'Monitor', 'Success');
        break;
      case 'MOBILE_CMD':
        addLog(`Input: ${payload}`, 'Mobile');
        break;
      case 'ROTATE_MOBILE':
        setMobileRotation(prev => (prev === 0 ? 90 : 0));
        addLog(`Device Orientation: ${mobileRotation === 0 ? 'Landscape' : 'Portrait'}`, 'Mobile');
        break;
      case 'CLEAR_LOG':
        setLogs([]);
        addLog('Diagnostic history cleared', 'System');
        break;
      case 'REMOVE_TRUSTED':
        setTrustedDevices(prev => prev.filter(d => d.ip !== payload));
        addLog('Device Trust Revoked', 'Security', 'Warning');
        break;
      case 'MONITOR_QUALITY':
        setMonitors(prev => prev.map(m => m.id === payload.id ? { ...m, quality: payload.quality } : m));
        break;
      case 'MONITOR_FPS':
        setMonitors(prev => prev.map(m => m.id === payload.id ? { ...m, fps: payload.fps } : m));
        break;
    }
  };

  const updateSettings = (section: keyof AppSettings, key: string, value: any) => {
    setSettings(prev => ({
      ...prev,
      [section]: {
        ...prev[section as keyof AppSettings],
        [key]: value
      }
    }));
  };

  const renderCurrentPage = () => {
    const props = { 
      state: { 
        localIP, pairingCode, pairingExpiry, connectedDevice, trustedDevices, 
        logs, monitors, settings, engineActive, previewActive, mobileRotation 
      }, 
      onAction, settingsTab, setSettingsTab, updateSettings 
    };
    
    switch (activeTab) {
      case 'Overview': return <OverviewPage {...props} />;
      case 'Pairing': return <PairingDevicesPage {...props} />;
      case 'Monitors': return <MonitorsPage {...props} />;
      case 'Control': return <MobileControlPage {...props} />;
      case 'Activity': return <SessionsActivityPage {...props} />;
      case 'Settings': return <SettingsGuidePage {...props} />;
      case 'Manual': return <ManualPage />;
      default: return <OverviewPage {...props} />;
    }
  };

  return (
    <div className="app-shell">
      <Sidebar 
        activeTab={activeTab} 
        onTabChange={setActiveTab} 
        engineActive={engineActive} 
        connectedDevice={connectedDevice} 
      />
      <div className="main-view">
        <Header 
          activeTab={activeTab} 
          localIP={localIP} 
          engineActive={engineActive}
          onToggleEngine={() => onAction('TOGGLE_ENGINE')}
          onRefresh={() => onAction('REGEN_CODE')} 
        />
        <main className="scroll-area">
          {renderCurrentPage()}
        </main>
      </div>
    </div>
  );
}

export default App;
