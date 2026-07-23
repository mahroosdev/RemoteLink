import React, { useState, useEffect, useRef } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import GlobalPairingRequest from './components/GlobalPairingRequest';
import SplashScreen from './components/SplashScreen';

// Pages
import OverviewPage from './pages/OverviewPage';
import PairingDevicesPage from './pages/PairingDevicesPage';
import MonitorsPage from './pages/MonitorsPage';
import MobileControlPage from './pages/MobileControlPageLive';
import SessionsActivityPage from './pages/SessionsActivityPage';
import SettingsGuidePage from './pages/SettingsGuidePage';
import ManualPage from './pages/ManualPage';

// Data & State
import { DeviceInfo, LogItem, AppSettings, defaultSettings, EngineState, FirewallStatus, MobileScreenFrame } from './state/appState';

const fallbackEngineState: EngineState = {
  engineActive: false,
  serverStatus: 'offline',
  discoveryStatus: 'offline',
  hostIp: 'Local IP unavailable',
  hostIpCandidates: [],
  hostIpFallbacks: [],
  port: 47777,
  pairingCode: '------',
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
};

const fallbackFirewallStatus: FirewallStatus = {
  platform: 'unknown',
  supported: false,
  appPath: '',
  appName: '',
  packaged: false,
  tcpRuleName: 'RemoteLink Local TCP 47777',
  udpRuleName: 'RemoteLink Local UDP Discovery 47778',
  hasScopedTcpAllow: false,
  hasScopedUdpAllow: false,
  hasEnabledBlockRules: false,
  blockRules: [],
  checkedAt: '',
};

function loadSettings(): AppSettings {
  const saved = localStorage.getItem('remotelink_settings');
  if (!saved) return defaultSettings;

  try {
    const parsed = JSON.parse(saved) as Partial<AppSettings>;
    const requestedTheme = parsed.general?.theme;
    const theme = requestedTheme === 'Professional Dark' || requestedTheme === 'Pure Black' || requestedTheme === 'Light'
      ? requestedTheme
      : defaultSettings.general.theme;
    return {
      general: { ...defaultSettings.general, ...(parsed.general ?? {}), theme },
      connection: { ...defaultSettings.connection, ...(parsed.connection ?? {}) },
      controls: { ...defaultSettings.controls, ...(parsed.controls ?? {}) },
      shortcuts: { ...defaultSettings.shortcuts, ...(parsed.shortcuts ?? {}) },
      monitors: { ...defaultSettings.monitors, ...(parsed.monitors ?? {}) },
      performance: { ...defaultSettings.performance, ...(parsed.performance ?? {}) },
      security: { ...defaultSettings.security, ...(parsed.security ?? {}) },
    };
  } catch {
    localStorage.removeItem('remotelink_settings');
    return defaultSettings;
  }
}

function normalizeEngineState(state: Partial<EngineState> | null | undefined): EngineState {
  return {
    ...fallbackEngineState,
    ...state,
    discoveryStatus: state?.discoveryStatus ?? fallbackEngineState.discoveryStatus,
    hostIpCandidates: state?.hostIpCandidates ?? fallbackEngineState.hostIpCandidates,
    hostIpFallbacks: state?.hostIpFallbacks ?? fallbackEngineState.hostIpFallbacks,
    pendingRequest: state?.pendingRequest ?? null,
    connectedDevice: state?.connectedDevice ?? null,
    detectedMonitors: state?.detectedMonitors ?? [],
    selectedMonitorId: state?.selectedMonitorId ?? null,
    lastInputAt: state?.lastInputAt ?? null,
    inputStatus: state?.inputStatus ?? fallbackEngineState.inputStatus,
    heldModifiers: state?.heldModifiers ?? [],
    previewStream: {
      ...fallbackEngineState.previewStream,
      ...(state?.previewStream ?? {}),
      monitorId: state?.previewStream?.monitorId ?? null,
      lastFrameAt: state?.previewStream?.lastFrameAt ?? null,
    },
    mobileScreenShare: {
      ...fallbackEngineState.mobileScreenShare,
      ...(state?.mobileScreenShare ?? {}),
      data: state?.mobileScreenShare?.data ?? null,
      lastFrameAt: state?.mobileScreenShare?.lastFrameAt ?? null,
    },
    activityLog: state?.activityLog ?? [],
  };
}

function App() {
  // Navigation State
  const [activeTab, setActiveTab] = useState('Overview');
  const [settingsTab, setSettingsTab] = useState('Appearance');
  // Brief startup splash shown once when the app opens.
  const [showSplash, setShowSplash] = useState(true);

  // App State
  const [engineState, setEngineState] = useState<EngineState>(fallbackEngineState);
  const [firewallStatus, setFirewallStatus] = useState<FirewallStatus>(fallbackFirewallStatus);
  const [firewallActionStatus, setFirewallActionStatus] = useState<string | null>(null);
  const [selectedHostIp, setSelectedHostIp] = useState<string | null>(null);
  const [pairingExpiry] = useState(60);
  const [trustedDevices, setTrustedDevices] = useState<DeviceInfo[]>([]);
  const [previewActive, setPreviewActive] = useState(false);
  const [mobileRotation, setMobileRotation] = useState(0); // 0 = portrait, 90 = landscape
  // Latest phone screen frame arrives on a dedicated IPC channel, kept out of
  // engineState so frames don't force app-wide re-renders.
  const [mobileFrame, setMobileFrame] = useState<MobileScreenFrame | null>(null);
  const activeTabRef = useRef(activeTab);

  const [settings, setSettings] = useState<AppSettings>(loadSettings);

  // Theme Application
  useEffect(() => {
    const root = window.document.documentElement;
    const theme = settings.general.theme;
    
    if (theme === 'Pure Black') {
      root.setAttribute('data-theme', 'pure-black');
    } else if (theme === 'Light') {
      root.setAttribute('data-theme', 'light');
    } else {
      root.removeAttribute('data-theme'); // Default "Professional Dark"
    }
    
    localStorage.setItem('remotelink_settings', JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    let mounted = true;
    window.remotelink.getEngineState().then((state) => {
      if (mounted) setEngineState(normalizeEngineState(state));
    });
    window.remotelink.getFirewallStatus().then((status) => {
      if (mounted) setFirewallStatus(status);
    }).catch((error) => {
      if (mounted) {
        setFirewallStatus({
          ...fallbackFirewallStatus,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
    const unsubscribe = window.remotelink.onEngineStateChanged((state) => {
      setEngineState(normalizeEngineState(state));
    });
    // Only retain frames while the Control page is visible so background tabs
    // never re-render on the ~10fps frame stream.
    const unsubscribeFrame = window.remotelink.onMobileScreenFrame((frame) => {
      if (!mounted || activeTabRef.current !== 'Control') return;
      setMobileFrame(frame);
    });
    return () => {
      mounted = false;
      unsubscribe();
      unsubscribeFrame();
    };
  }, []);

  useEffect(() => {
    activeTabRef.current = activeTab;
    if (activeTab !== 'Control') setMobileFrame(null);
  }, [activeTab]);

  // Debounce firewall re-checks: a burst of engine status transitions
  // (offline -> starting -> listening) collapses into a single cached scan.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      window.remotelink.getFirewallStatus().then((status) => {
        if (!cancelled) setFirewallStatus(status);
      }).catch(() => undefined);
    }, 1500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [engineState.serverStatus, engineState.discoveryStatus]);

  const mobileShareStatus = engineState.mobileScreenShare.status;
  const mobileShareActive = mobileShareStatus === 'sharing' || mobileShareStatus === 'starting' || mobileShareStatus === 'stopping';

  // Drop a stale frame once the share is no longer active.
  useEffect(() => {
    if (!mobileShareActive) setMobileFrame(null);
  }, [mobileShareActive]);

  // Metadata comes from engineState; the live image/dimensions/timestamp come
  // from the dedicated frame channel and are merged back in for the viewer.
  const mobileScreenShareForPage = mobileShareActive && mobileFrame
    ? {
        ...engineState.mobileScreenShare,
        data: mobileFrame.data,
        format: mobileFrame.format,
        width: mobileFrame.width,
        height: mobileFrame.height,
        lastFrameAt: mobileFrame.timestamp,
      }
    : { ...engineState.mobileScreenShare, data: null };

  const connectedDevice = engineState.connectedDevice;
  const selectableHostIps = engineState.hostIpCandidates;
  const displayHostIp = selectedHostIp && selectableHostIps.includes(selectedHostIp)
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
      device: connectedDevice?.status === 'Connected' ? connectedDevice.name : undefined,
      status
    };
    setEngineState(prev => ({ ...prev, activityLog: [newLog, ...prev.activityLog] }));
  };

  const applyEngineAction = async (action: Promise<EngineState>) => {
    const nextState = await action;
    setEngineState(normalizeEngineState(nextState));
    return nextState;
  };

  const refreshFirewallStatus = async () => {
    // Manual refresh bypasses the cache for an up-to-date reading.
    const status = await window.remotelink.getFirewallStatus(true);
    setFirewallStatus(status);
    return status;
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
        addLog(`Local desktop preview: ${newPrev ? 'Active' : 'Stopped'}`, 'Monitor');
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
        break;
      case 'DENY':
        applyEngineAction(window.remotelink.denyPairing());
        break;
      case 'DISCONNECT':
        setPreviewActive(false);
        applyEngineAction(window.remotelink.disconnectDevice());
        break;
      case 'RELEASE_ALL_KEYS':
        return applyEngineAction(window.remotelink.releaseAllKeys());
      case 'STOP_PHONE_SCREEN':
        return applyEngineAction(window.remotelink.stopPhoneScreenShare());
      case 'SWITCH_MONITOR':
        setEngineState(prev => ({
          ...prev,
          detectedMonitors: prev.detectedMonitors.map(m => ({ ...m, isActive: m.id === payload })),
        }));
        addLog(`Local preview source selected: ${payload}`, 'Monitor', 'Success');
        break;
      case 'MOBILE_CMD':
        addLog(`Input: ${payload}`, 'Mobile');
        break;
      case 'SELECT_HOST_IP':
        setSelectedHostIp(payload);
        addLog(`Host IP selected: ${payload}`, 'System');
        break;
      case 'REFRESH_FIREWALL':
        setFirewallActionStatus('Checking Windows Firewall...');
        return refreshFirewallStatus()
          .then(() => setFirewallActionStatus('Firewall status refreshed.'))
          .catch(() => setFirewallActionStatus('Firewall diagnostic check failed.'));
      case 'FIX_FIREWALL':
        setFirewallActionStatus('Windows will ask permission to add scoped local rules.');
        return window.remotelink.repairLocalFirewall()
          .then((result) => {
            setFirewallStatus(result.status);
            setFirewallActionStatus(result.ok
              ? 'Scoped local firewall rules are installed.'
              : 'Firewall access update failed. RemoteLink could not update local firewall access. Try again or check Windows Security.');
            addLog(
              result.ok ? 'Scoped local firewall rules installed' : 'Firewall access update failed',
              'System',
              result.ok ? 'Success' : 'Warning',
            );
          })
          .catch(() => {
            setFirewallActionStatus('Firewall access update failed. RemoteLink could not update local firewall access. Try again or check Windows Security.');
            addLog('Firewall repair failed', 'System', 'Warning');
          });
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
        discoveryStatus: engineState.discoveryStatus,
        discoveryError: engineState.discoveryError,
        hostIpCandidates: engineState.hostIpCandidates,
        hostIpFallbacks: engineState.hostIpFallbacks,
        selectedHostIp: localIP,
        pendingRequest: engineState.pendingRequest, engineError: engineState.error,
        selectedMonitorId: engineState.selectedMonitorId,
        previewStream: engineState.previewStream,
        mobileScreenShare: mobileScreenShareForPage,
        firewallStatus,
        firewallActionStatus,
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
    <>
      {showSplash && <SplashScreen onFinish={() => setShowSplash(false)} />}
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
          {activeTab === 'Overview' && (
            <GlobalPairingRequest
              request={engineState.pendingRequest}
              onApprove={() => onAction('APPROVE')}
              onDeny={() => onAction('DENY')}
            />
          )}
          {renderCurrentPage()}
        </main>
      </div>
      </div>
    </>
  );
}

export default App;
