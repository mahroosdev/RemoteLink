import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import GlobalPairingRequest from './components/GlobalPairingRequest';

// Pages
import OverviewPage from './pages/OverviewPage';
import PairingDevicesPage from './pages/PairingDevicesPage';
import MonitorsPage from './pages/MonitorsPage';
import MobileControlPage from './pages/MobileControlPage';
import SessionsActivityPage from './pages/SessionsActivityPage';
import SettingsGuidePage from './pages/SettingsGuidePage';
import ManualPage from './pages/ManualPage';

// Data & State
import { DeviceInfo, LogItem, MonitorInfo, AppSettings, defaultSettings, EngineState } from './state/appState';
import { mockConnectedDevice, initialLogs, mockMonitors } from './data/mockData';

const fallbackEngineState: EngineState = {
  engineActive: false,
  serverStatus: 'offline',
  hostIp: 'Local IP unavailable',
  hostIpCandidates: [],
  hostIpFallbacks: [],
  port: 47777,
  pairingCode: '------',
  pendingRequest: null,
  connectedDevice: null,
  detectedMonitors: mockMonitors,
  activityLog: initialLogs,
};

function App() {
  // Navigation State
  const [activeTab, setActiveTab] = useState('Overview');
  const [settingsTab, setSettingsTab] = useState('General');

  // App State
  const [engineState, setEngineState] = useState<EngineState>(fallbackEngineState);
  const [selectedHostIp, setSelectedHostIp] = useState<string | null>(null);
  const [pairingExpiry] = useState(60);
  const [trustedDevices, setTrustedDevices] = useState<DeviceInfo[]>([]);
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

  useEffect(() => {
    let mounted = true;
    window.remotelink.getEngineState().then((state) => {
      if (mounted) setEngineState(state);
    });
    const unsubscribe = window.remotelink.onEngineStateChanged((state) => {
      setEngineState(state);
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const connectedDevice = engineState.connectedDevice ?? mockConnectedDevice;
  const allHostIps = [...engineState.hostIpCandidates, ...engineState.hostIpFallbacks];
  const displayHostIp = selectedHostIp && allHostIps.includes(selectedHostIp)
    ? selectedHostIp
    : engineState.hostIp;
  const logs = engineState.activityLog;
  const monitors = engineState.detectedMonitors;
  const engineActive = engineState.engineActive;
  const localIP = displayHostIp;
  const pairingCode = engineState.pairingCode;

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
    setEngineState(prev => ({ ...prev, activityLog: [newLog, ...prev.activityLog] }));
  };

  const applyEngineAction = async (action: Promise<EngineState>) => {
    const nextState = await action;
    setEngineState(nextState);
  };

  const onAction = (type: string, payload?: any) => {
    switch (type) {
      case 'NAV':
        setActiveTab(payload);
        break;
      case 'TOGGLE_ENGINE':
        if (engineActive) {
          setPreviewActive(false);
          applyEngineAction(window.remotelink.stopEngine());
        } else {
          applyEngineAction(window.remotelink.startEngine());
        }
        break;
      case 'TOGGLE_PREVIEW':
        if (!engineActive) return;
        const newPrev = !previewActive;
        setPreviewActive(newPrev);
        addLog(`Monitor Broadcast: ${newPrev ? 'Active' : 'Standby'}`, 'Monitor');
        break;
      case 'REGEN_CODE':
        applyEngineAction(window.remotelink.regeneratePairingCode());
        break;
      case 'APPROVE':
        applyEngineAction(window.remotelink.approvePairing()).then(() => {
          if (engineState.pendingRequest) {
            setTrustedDevices(prev => [...prev, {
              name: engineState.pendingRequest!.deviceName,
              os: 'Android / RemoteLink Mobile',
              status: 'Connected',
              lastSeen: 'Active Now',
              ip: engineState.pendingRequest!.ip,
            }]);
          }
        });
        setActiveTab('Overview');
        break;
      case 'DENY':
        applyEngineAction(window.remotelink.denyPairing());
        break;
      case 'DISCONNECT':
        setPreviewActive(false);
        applyEngineAction(window.remotelink.disconnectDevice());
        break;
      case 'SWITCH_MONITOR':
        setEngineState(prev => ({
          ...prev,
          detectedMonitors: prev.detectedMonitors.map(m => ({ ...m, isActive: m.id === payload })),
        }));
        addLog(`Stream target: ${payload === 1 ? 'Display 1' : 'Display 2'}`, 'Monitor', 'Success');
        break;
      case 'MOBILE_CMD':
        addLog(`Input: ${payload}`, 'Mobile');
        break;
      case 'SELECT_HOST_IP':
        setSelectedHostIp(payload);
        addLog(`Host IP selected: ${payload}`, 'System');
        break;
      case 'ROTATE_MOBILE':
        setMobileRotation(prev => (prev === 0 ? 90 : 0));
        addLog(`Device Orientation: ${mobileRotation === 0 ? 'Landscape' : 'Portrait'}`, 'Mobile');
        break;
      case 'CLEAR_LOG':
        applyEngineAction(window.remotelink.clearActivityLog());
        break;
      case 'REMOVE_TRUSTED':
        setTrustedDevices(prev => prev.filter(d => d.ip !== payload));
        addLog('Device Trust Revoked', 'Security', 'Warning');
        break;
      case 'MONITOR_QUALITY':
        setEngineState(prev => ({
          ...prev,
          detectedMonitors: prev.detectedMonitors.map(m => m.id === payload.id ? { ...m, quality: payload.quality } : m),
        }));
        break;
      case 'MONITOR_FPS':
        setEngineState(prev => ({
          ...prev,
          detectedMonitors: prev.detectedMonitors.map(m => m.id === payload.id ? { ...m, fps: payload.fps } : m),
        }));
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
        logs, monitors, settings, engineActive, previewActive, mobileRotation,
        serverStatus: engineState.serverStatus, port: engineState.port,
        hostIpCandidates: engineState.hostIpCandidates,
        hostIpFallbacks: engineState.hostIpFallbacks,
        selectedHostIp: localIP,
        pendingRequest: engineState.pendingRequest, engineError: engineState.error,
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
          serverStatus={engineState.serverStatus}
          onToggleEngine={() => onAction('TOGGLE_ENGINE')}
          onRefresh={() => onAction('REGEN_CODE')} 
        />
        <main className="scroll-area">
          <GlobalPairingRequest
            request={engineState.pendingRequest}
            onApprove={() => onAction('APPROVE')}
            onDeny={() => onAction('DENY')}
          />
          {renderCurrentPage()}
        </main>
      </div>
    </div>
  );
}

export default App;
