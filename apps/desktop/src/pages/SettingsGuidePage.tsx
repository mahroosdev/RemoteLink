import React, { useState } from 'react';
import { BookOpen, Globe, Monitor, Smartphone, Cpu, ShieldCheck, Zap, Layout, Keyboard } from 'lucide-react';
import { Card, Toggle, Select, Range, Button } from '../components/Common';

const SettingRow = ({ title, description, children, inactive = false }: any) => (
  <div className="setting-row" style={inactive ? { opacity: 0.62 } : undefined}>
    <div className="setting-info" style={{ maxWidth: '70%' }}>
      <h4>
        {title}
        {inactive && (
          <span style={{ marginLeft: '8px', fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Available later</span>
        )}
      </h4>
      <p>{description}</p>
    </div>
    <div className="setting-control" style={{ flexShrink: 0, pointerEvents: inactive ? 'none' : undefined }}>
      {children}
    </div>
  </div>
);

const SettingsGuidePage = ({ state, settingsTab, setSettingsTab, updateSettings, onAction }: any) => {
  const tabs = ['General', 'Connection', 'Controls', 'Shortcut Keys', 'Monitors', 'Performance', 'Security', 'Setup Guide'];
  const [releaseStatus, setReleaseStatus] = useState<string | null>(null);

  const releaseAllKeys = async () => {
    setReleaseStatus('Releasing keys...');
    try {
      await Promise.resolve(onAction('RELEASE_ALL_KEYS'));
      setReleaseStatus('All held keys (Ctrl, Shift, Alt, and Win) were released.');
    } catch {
      setReleaseStatus('Could not release the keys. Reconnect and try again.');
    }
  };

  const renderTabContent = () => {
    switch(settingsTab) {
      case 'General':
        return (
          <Card>
            <SettingRow inactive title="Start with Windows" description="Available in a later update. Start RemoteLink manually for now.">
               <Toggle checked={state.settings.general.startWithWindows} onChange={(v) => updateSettings('general', 'startWithWindows', v)} />
            </SettingRow>
            <SettingRow inactive title="Minimize to Tray" description="Available in a later update. Closing behavior stays unchanged for now.">
               <Toggle checked={state.settings.general.minimizeToTray} onChange={(v) => updateSettings('general', 'minimizeToTray', v)} />
            </SettingRow>
            <SettingRow title="Theme Interface" description="Select the high-fidelity visual appearance of the application workspace.">
               <Select value={state.settings.general.theme} onChange={(v) => updateSettings('general', 'theme', v)} options={['Professional Dark', 'Pure Black', 'Light']} />
            </SettingRow>
            <SettingRow inactive title="Display Language" description="Available in a later update. The desktop interface is currently English only.">
               <Select value={state.settings.general.language} onChange={(v) => updateSettings('general', 'language', v)} options={['English', 'Spanish', 'German', 'French']} />
            </SettingRow>
            <SettingRow inactive title="System Notifications" description="Available in a later update. Connection and pairing status are shown inside the app.">
               <Toggle checked={state.settings.general.notifications} onChange={(v) => updateSettings('general', 'notifications', v)} />
            </SettingRow>
          </Card>
        );
      case 'Connection':
        return (
          <Card>
             <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '32px' }}>
                <div style={{ padding: '24px', background: 'var(--bg-main)', borderRadius: '16px', border: '1px solid var(--border-subtle)' }}>
                   <p className="text-muted" style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px' }}>Host IP</p>
                   <code style={{ fontSize: '18px', fontWeight: 600, color: 'var(--accent-blue)' }}>{state.localIP}</code>
                </div>
                <div style={{ padding: '24px', background: 'var(--bg-main)', borderRadius: '16px', border: '1px solid var(--border-subtle)' }}>
                   <p className="text-muted" style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px' }}>Pairing Code</p>
                   <code style={{ fontSize: '18px', fontWeight: 600, color: 'var(--accent-blue)' }}>{state.pairingCode}</code>
                </div>
             </div>
             <SettingRow inactive title="Auto-Reconnect" description="Available in a later update. Reconnect manually with the current pairing code.">
                <Toggle checked={state.settings.connection.autoReconnect} onChange={(v) => updateSettings('connection', 'autoReconnect', v)} />
             </SettingRow>
             <SettingRow inactive title="Security Approval Mode" description="Available in a later update. New sessions currently require desktop approval.">
                <Select value={state.settings.connection.approvalMode} onChange={(v) => updateSettings('connection', 'approvalMode', v)} options={['Ask Every Time', 'Trusted Devices Only', 'Manual Approval']} />
             </SettingRow>
             <SettingRow inactive title="Nearby Network Only" description="Available in a later update. RemoteLink currently uses local network pairing.">
                <Toggle checked={state.settings.connection.nearbyMode} onChange={(v) => updateSettings('connection', 'nearbyMode', v)} />
             </SettingRow>
             <div style={{ marginTop: '24px', padding: '24px', background: 'var(--bg-sidebar)', borderRadius: '16px', border: '1px solid var(--border-subtle)', opacity: 0.62 }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', gap: '10px' }}><Globe size={18} /> Remote Access Bridge</h4>
                <p className="text-muted" style={{ fontSize: '13px', margin: 0 }}>Available in a later update. This version supports local network pairing only.</p>
             </div>
          </Card>
        );
      case 'Controls':
        return (
          <Card>
            <SettingRow title="Cursor Sensitivity" description="Scaling factor for remote mouse movement translation on the host desktop.">
               <Range value={state.settings.controls.mouseSensitivity} onChange={(v) => updateSettings('controls', 'mouseSensitivity', v)} />
            </SettingRow>
            <SettingRow inactive title="Input Map Mode" description="Available in a later update. Current PC input uses the mobile remote controls and relative touchpad movement.">
               <Select value={state.settings.controls.touchpadMode} onChange={(v) => updateSettings('controls', 'touchpadMode', v)} options={['Virtual Trackpad', 'Direct Touch']} />
            </SettingRow>
            <SettingRow title="Scroll Velocity" description="Adjustment for the vertical and horizontal wheel emulation speed.">
               <Range value={state.settings.controls.scrollSpeed} onChange={(v) => updateSettings('controls', 'scrollSpeed', v)} />
            </SettingRow>
            <SettingRow inactive title="Interaction Threshold" description="Available in a later update. Long-press behavior is handled by the mobile app controls.">
               <Range value={state.settings.controls.longPressDuration} min={200} max={1500} onChange={(v) => updateSettings('controls', 'longPressDuration', v)} />
            </SettingRow>
            <SettingRow inactive title="Haptic Feedback" description="Available in a later update. Desktop settings cannot control phone vibration in this version.">
               <Toggle checked={state.settings.controls.vibrationFeedback} onChange={(v) => updateSettings('controls', 'vibrationFeedback', v)} />
            </SettingRow>
          </Card>
        );
      case 'Shortcut Keys':
        return (
          <Card>
            <SettingRow inactive title="Modifier Persistence" description="Available in a later update. Modifier keys are controlled by the mobile remote and Release All Keys.">
               <Toggle checked={state.settings.shortcuts.stickyModifiers} onChange={(v) => updateSettings('shortcuts', 'stickyModifiers', v)} />
            </SettingRow>
            <SettingRow inactive title="Desktop Quick Actions" description="Available in a later update. Mobile shortcut buttons are shown by the mobile app.">
               <Toggle checked={state.settings.shortcuts.quickActions} onChange={(v) => updateSettings('shortcuts', 'quickActions', v)} />
            </SettingRow>
            <SettingRow inactive title="System window management" description="Available in a later update as a policy setting. Available shortcut buttons still send real input when paired.">
               <Toggle checked={state.settings.shortcuts.altTabSupport} onChange={(v) => updateSettings('shortcuts', 'altTabSupport', v)} />
            </SettingRow>
            <SettingRow inactive title="Function Bar (F1-F12)" description="Available in a later update as a desktop setting. Function keys are controlled from the mobile remote UI.">
               <Toggle checked={state.settings.shortcuts.fKeysEnabled} onChange={(v) => updateSettings('shortcuts', 'fKeysEnabled', v)} />
            </SettingRow>
            <div style={{ marginTop: '24px' }}>
               <Button variant="danger" style={{ width: '100%' }} onClick={releaseAllKeys}>Release All Virtual Keys</Button>
               {releaseStatus && (
                 <p className="text-muted" style={{ margin: '10px 0 0 0', fontSize: '12px' }}>{releaseStatus}</p>
               )}
            </div>
          </Card>
        );
      case 'Monitors':
        return (
          <Card>
            <SettingRow inactive title="Default Stream Target" description="Available in a later update. The mobile app selects the preview screen during a live session.">
               <Select value={String(state.settings.monitors.defaultMonitor)} onChange={(v) => updateSettings('monitors', 'defaultMonitor', parseInt(v))} options={state.monitors.map((m:any)=>({label: m.name, value: String(m.id)}))} />
            </SettingRow>
            <SettingRow inactive title="Topology Detection" description="Available in a later update as a setting. Monitor lists are reported by the engine when available.">
               <Toggle checked={state.settings.monitors.autoDetect} onChange={(v) => updateSettings('monitors', 'autoDetect', v)} />
            </SettingRow>
            <SettingRow inactive title="Active Filters" description="Available in a later update. The app currently shows monitors reported by the desktop engine.">
               <Toggle checked={state.settings.monitors.showOnlyConnected} onChange={(v) => updateSettings('monitors', 'showOnlyConnected', v)} />
            </SettingRow>
          </Card>
        );
      case 'Performance':
        return (
          <Card>
            <SettingRow inactive title="Stream Quality" description="Available in a later update. Preview quality is currently set automatically.">
               <Select value={state.settings.performance.streamQuality} onChange={(v) => updateSettings('performance', 'streamQuality', v)} options={['High (1080p)', 'Balanced (720p)', 'Performance (480p)']} />
            </SettingRow>
            <SettingRow inactive title="Target Frame Rate" description="Available in a later update. This setting does not change current streaming FPS.">
               <Select value={String(state.settings.performance.fps)} onChange={(v) => updateSettings('performance', 'fps', parseInt(v))} options={['15', '30', '60']} />
            </SettingRow>
            <SettingRow inactive title="Low Latency Mode" description="Available in a later update. This desktop setting does not change latency yet.">
               <Toggle checked={state.settings.performance.lowLatencyMode} onChange={(v) => updateSettings('performance', 'lowLatencyMode', v)} />
            </SettingRow>
            <SettingRow inactive title="Adaptive Bitrate" description="Available in a later update. Network-adaptive bitrate is not implemented in this version.">
               <Toggle checked={state.settings.performance.adaptiveQuality} onChange={(v) => updateSettings('performance', 'adaptiveQuality', v)} />
            </SettingRow>
            <SettingRow inactive title="Bandwidth Cap (Mbps)" description="Available in a later update. This setting does not limit outbound stream bitrate.">
               <Range value={state.settings.performance.bitrate} min={1} max={50} onChange={(v) => updateSettings('performance', 'bitrate', v)} />
            </SettingRow>
          </Card>
        );
      case 'Security':
        return (
          <Card>
            <SettingRow inactive title="Mandatory PC Approval" description="Always required in this version. This toggle does not change pairing approval policy.">
               <Toggle checked={state.settings.security.requireApproval} onChange={(v) => updateSettings('security', 'requireApproval', v)} />
            </SettingRow>
            <SettingRow inactive title="Connection Status Display" description="Connection status is shown in the app. No separate desktop overlay is installed in this version.">
               <Toggle checked={state.settings.security.showIndicator} onChange={(v) => updateSettings('security', 'showIndicator', v)} />
            </SettingRow>
            <SettingRow inactive title="Inactivity Disconnect" description="Available in a later update. Disconnect manually to stop input and streaming.">
               <Select value={state.settings.security.sessionTimeout} onChange={(v) => updateSettings('security', 'sessionTimeout', v)} options={['Never', '15 Minutes', '1 Hour']} />
            </SettingRow>
            <div style={{ marginTop: '32px', padding: '20px', background: 'rgba(239, 68, 68, 0.05)', borderRadius: '16px', border: '1px solid rgba(239, 68, 68, 0.1)' }}>
               <p style={{ margin: 0, fontSize: '13px', color: 'var(--accent-red)', lineHeight: 1.5 }}>
                  <strong>Security note:</strong> RemoteLink requires the desktop engine, matching pairing code, and host approval.
                  Connection status is shown in the app. Do not approve devices you do not trust.
               </p>
            </div>
          </Card>
        );
      case 'Setup Guide':
        return (
          <div className="grid">
             {[
               { s: 1, t: 'Start Desktop Engine', d: 'Open RemoteLink and turn Engine Online. The desktop will show Online, Listening, Recommended Host IP, and Pairing Code.' },
               { s: 2, t: 'Use Same Local Network', d: 'Connect your phone and PC to the same Wi-Fi or your own phone hotspot. Internet is not required for local mode.' },
               { s: 3, t: 'Connect From Mobile', d: 'Use scan or enter the Recommended Host IP manually. Some routers and hotspots block scan, but manual IP can still work.' },
               { s: 4, t: 'Approve Safely', d: 'Approve the pairing request on this PC only when you recognize the phone. Avoid untrusted public Wi-Fi unless you understand the risk.' },
               { s: 5, t: 'Firewall Access', d: 'If the phone cannot reach this PC, use Pairing & Devices > Fix Local Firewall Access. It requests Windows permission and adds only scoped local rules.' },
               { s: 6, t: 'Stay Local', d: 'Use RemoteLink only on trusted Wi-Fi or your own hotspot. Disconnect when you are finished.' }
             ].map(item => (
               <Card key={item.s} className="col-6" style={{ background: 'var(--bg-card-elevated)', padding: '24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '8px' }}>
                     <div style={{ width: '32px', height: '32px', background: 'var(--bg-main)', border: '1px solid var(--border-subtle)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 700, color: 'var(--accent-blue)' }}>{item.s}</div>
                     <h4 style={{ fontSize: '16px', fontWeight: 600 }}>{item.t}</h4>
                  </div>
                  <p className="text-muted" style={{ margin: 0, fontSize: '13.5px', lineHeight: 1.5 }}>{item.d}</p>
               </Card>
             ))}
             <div className="col-12" style={{ textAlign: 'center', marginTop: '32px' }}>
                <Button variant="primary" style={{ padding: '14px 40px' }} onClick={() => onAction('NAV', 'Manual')}>
                   <BookOpen size={18} /> <span>Open Comprehensive Application Manual</span>
                </Button>
             </div>
          </div>
        );
      default: return null;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
       <div className="tabs-container">
          {tabs.map(t => (
            <button key={t} className={`tab-btn ${settingsTab === t ? 'active' : ''}`} onClick={() => setSettingsTab(t)}>{t}</button>
          ))}
       </div>
       <div style={{ minHeight: '600px' }}>{renderTabContent()}</div>
    </div>
  );
};

export default SettingsGuidePage;

