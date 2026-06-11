import React from 'react';
import { BookOpen, Globe, Monitor, Smartphone, Cpu, ShieldCheck, Zap, Layout, Keyboard } from 'lucide-react';
import { Card, Toggle, Select, Range, Button } from '../components/Common';

const SettingRow = ({ title, description, children }: any) => (
  <div className="setting-row">
    <div className="setting-info" style={{ maxWidth: '70%' }}>
      <h4>{title}</h4>
      <p>{description}</p>
    </div>
    <div className="setting-control" style={{ flexShrink: 0 }}>
      {children}
    </div>
  </div>
);

const SettingsGuidePage = ({ state, settingsTab, setSettingsTab, updateSettings, onAction }: any) => {
  const tabs = ['General', 'Connection', 'Controls', 'Shortcut Keys', 'Monitors', 'Performance', 'Security', 'Setup Guide'];

  const renderTabContent = () => {
    switch(settingsTab) {
      case 'General':
        return (
          <Card>
            <SettingRow title="Start with Windows" description="Automatically launch RemoteLink Pro when your computer boots into the desktop.">
               <Toggle checked={state.settings.general.startWithWindows} onChange={(v) => updateSettings('general', 'startWithWindows', v)} />
            </SettingRow>
            <SettingRow title="Minimize to Tray" description="Closing the main application window will hide it in the system tray instead of exiting.">
               <Toggle checked={state.settings.general.minimizeToTray} onChange={(v) => updateSettings('general', 'minimizeToTray', v)} />
            </SettingRow>
            <SettingRow title="Theme Interface" description="Select the high-fidelity visual appearance of the application workspace.">
               <Select value={state.settings.general.theme} onChange={(v) => updateSettings('general', 'theme', v)} options={['Professional Dark', 'Pure Black', 'Light', 'System Default']} />
            </SettingRow>
            <SettingRow title="Display Language" description="Select the preferred language for all interface labels and documentation.">
               <Select value={state.settings.general.language} onChange={(v) => updateSettings('general', 'language', v)} options={['English', 'Spanish', 'German', 'French']} />
            </SettingRow>
            <SettingRow title="System Notifications" description="Receive desktop alerts for device connections, security handshake events, and system status.">
               <Toggle checked={state.settings.general.notifications} onChange={(v) => updateSettings('general', 'notifications', v)} />
            </SettingRow>
          </Card>
        );
      case 'Connection':
        return (
          <Card>
             <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '32px' }}>
                <div style={{ padding: '24px', background: 'var(--bg-main)', borderRadius: '16px', border: '1px solid var(--border-subtle)' }}>
                   <p className="text-muted" style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px' }}>Host IP Interface</p>
                   <code style={{ fontSize: '18px', fontWeight: 600, color: 'var(--accent-blue)' }}>{state.localIP}</code>
                </div>
                <div style={{ padding: '24px', background: 'var(--bg-main)', borderRadius: '16px', border: '1px solid var(--border-subtle)' }}>
                   <p className="text-muted" style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px' }}>Active Handshake</p>
                   <code style={{ fontSize: '18px', fontWeight: 600, color: 'var(--accent-blue)' }}>{state.pairingCode}</code>
                </div>
             </div>
             <SettingRow title="Auto-Reconnect" description="Attempt to restore the secure tunnel automatically with the last authorized mobile device.">
                <Toggle checked={state.settings.connection.autoReconnect} onChange={(v) => updateSettings('connection', 'autoReconnect', v)} />
             </SettingRow>
             <SettingRow title="Security Approval Mode" description="Configure the validation requirement for incoming mobile connection requests.">
                <Select value={state.settings.connection.approvalMode} onChange={(v) => updateSettings('connection', 'approvalMode', v)} options={['Ask Every Time', 'Trusted Devices Only', 'Manual Approval']} />
             </SettingRow>
             <SettingRow title="Nearby Network Only" description="Limit visibility and discovery to devices on the same local Wi-Fi subnet.">
                <Toggle checked={state.settings.connection.nearbyMode} onChange={(v) => updateSettings('connection', 'nearbyMode', v)} />
             </SettingRow>
             <div style={{ marginTop: '24px', padding: '24px', background: 'var(--bg-sidebar)', borderRadius: '16px', border: '1px solid var(--border-subtle)' }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', gap: '10px' }}><Globe size={18} /> Remote Access Bridge</h4>
                <p className="text-muted" style={{ fontSize: '13px', margin: 0 }}>Planned architecture for encrypted cloud relay, allowing secure access over LTE/4G from any location.</p>
             </div>
          </Card>
        );
      case 'Controls':
        return (
          <Card>
            <SettingRow title="Cursor Sensitivity" description="Scaling factor for remote mouse movement translation on the host desktop.">
               <Range value={state.settings.controls.mouseSensitivity} onChange={(v) => updateSettings('controls', 'mouseSensitivity', v)} />
            </SettingRow>
            <SettingRow title="Input Map Mode" description="Choose between a virtual trackpad (relative) or direct screen touch (absolute) mapping.">
               <Select value={state.settings.controls.touchpadMode} onChange={(v) => updateSettings('controls', 'touchpadMode', v)} options={['Virtual Trackpad', 'Direct Touch']} />
            </SettingRow>
            <SettingRow title="Scroll Velocity" description="Adjustment for the vertical and horizontal wheel emulation speed.">
               <Range value={state.settings.controls.scrollSpeed} onChange={(v) => updateSettings('controls', 'scrollSpeed', v)} />
            </SettingRow>
            <SettingRow title="Interaction Threshold" description="Minimum duration required to register a long-press event for drag or secondary click.">
               <Range value={state.settings.controls.longPressDuration} min={200} max={1500} onChange={(v) => updateSettings('controls', 'longPressDuration', v)} />
            </SettingRow>
            <SettingRow title="Haptic Feedback" description="Trigger physical vibration on the mobile device for click and scroll events.">
               <Toggle checked={state.settings.controls.vibrationFeedback} onChange={(v) => updateSettings('controls', 'vibrationFeedback', v)} />
            </SettingRow>
          </Card>
        );
      case 'Shortcut Keys':
        return (
          <Card>
            <SettingRow title="Modifier Persistence" description="Keep control, alt, and shift keys 'locked' until the next primary alphanumeric key is pressed.">
               <Toggle checked={state.settings.shortcuts.stickyModifiers} onChange={(v) => updateSettings('shortcuts', 'stickyModifiers', v)} />
            </SettingRow>
            <SettingRow title="Desktop Quick Actions" description="Enable floating toolbar buttons on mobile for copy, paste, and task management.">
               <Toggle checked={state.settings.shortcuts.quickActions} onChange={(v) => updateSettings('shortcuts', 'quickActions', v)} />
            </SettingRow>
            <SettingRow title="System window management" description="Allow system-wide window switching gestures (Alt+Tab) to be triggered from mobile.">
               <Toggle checked={state.settings.shortcuts.altTabSupport} onChange={(v) => updateSettings('shortcuts', 'altTabSupport', v)} />
            </SettingRow>
            <SettingRow title="Function Bar (F1-F12)" description="Display the function key row on the remote control keyboard interface.">
               <Toggle checked={state.settings.shortcuts.fKeysEnabled} onChange={(v) => updateSettings('shortcuts', 'fKeysEnabled', v)} />
            </SettingRow>
            <div style={{ marginTop: '24px' }}>
               <Button variant="danger" style={{ width: '100%' }} onClick={() => onAction('MOBILE_CMD', 'Release All Keys')}>EMERGENCY RESET: RELEASE ALL VIRTUAL KEYS</Button>
            </div>
          </Card>
        );
      case 'Monitors':
        return (
          <Card>
            <SettingRow title="Default Stream Target" description="Select the monitor to be broadcasted automatically when a new session starts.">
               <Select value={String(state.settings.monitors.defaultMonitor)} onChange={(v) => updateSettings('monitors', 'defaultMonitor', parseInt(v))} options={state.monitors.map((m:any)=>({label: m.name, value: String(m.id)}))} />
            </SettingRow>
            <SettingRow title="Topology Detection" description="Instantly update the mobile interface layout when display hardware is changed.">
               <Toggle checked={state.settings.monitors.autoDetect} onChange={(v) => updateSettings('monitors', 'autoDetect', v)} />
            </SettingRow>
            <SettingRow title="Active Filters" description="Only show connected and active displays in the monitor selection tab.">
               <Toggle checked={state.settings.monitors.showOnlyConnected} onChange={(v) => updateSettings('monitors', 'showOnlyConnected', v)} />
            </SettingRow>
          </Card>
        );
      case 'Performance':
        return (
          <Card>
            <SettingRow title="Broadcast Profile" description="Select the video resolution and encoding compression profile for the remote stream.">
               <Select value={state.settings.performance.streamQuality} onChange={(v) => updateSettings('performance', 'streamQuality', v)} options={['High (1080p)', 'Balanced (720p)', 'Performance (480p)']} />
            </SettingRow>
            <SettingRow title="Target Frame Rate" description="Maximum frames per second for the remote display mirroring engine.">
               <Select value={String(state.settings.performance.fps)} onChange={(v) => updateSettings('performance', 'fps', parseInt(v))} options={['15', '30', '60']} />
            </SettingRow>
            <SettingRow title="Low Latency Pipeline" description="Prioritize frame delivery speed over image quality. Recommended for local use.">
               <Toggle checked={state.settings.performance.lowLatencyMode} onChange={(v) => updateSettings('performance', 'lowLatencyMode', v)} />
            </SettingRow>
            <SettingRow title="Adaptive Bitrate" description="Automatically scale stream quality based on measured network congestion.">
               <Toggle checked={state.settings.performance.adaptiveQuality} onChange={(v) => updateSettings('performance', 'adaptiveQuality', v)} />
            </SettingRow>
            <SettingRow title="Bandwidth Cap (Mbps)" description="Limit the maximum outbound network bitrate used by the capture module.">
               <Range value={state.settings.performance.bitrate} min={1} max={50} onChange={(v) => updateSettings('performance', 'bitrate', v)} />
            </SettingRow>
          </Card>
        );
      case 'Security':
        return (
          <Card>
            <SettingRow title="Mandatory PC Approval" description="A visible confirmation dialog will appear on this PC for every new session attempt.">
               <Toggle checked={state.settings.security.requireApproval} onChange={(v) => updateSettings('security', 'requireApproval', v)} />
            </SettingRow>
            <SettingRow title="Session Active Overlay" description="Display a persistent 'REMOTE CONTROL ACTIVE' indicator on the host desktop.">
               <Toggle checked={state.settings.security.showIndicator} onChange={(v) => updateSettings('security', 'showIndicator', v)} />
            </SettingRow>
            <SettingRow title="Inactivity Disconnect" description="Automatically close the remote tunnel after a period of zero input detection.">
               <Select value={state.settings.security.sessionTimeout} onChange={(v) => updateSettings('security', 'sessionTimeout', v)} options={['Never', '15 Minutes', '1 Hour']} />
            </SettingRow>
            <div style={{ marginTop: '32px', padding: '20px', background: 'rgba(239, 68, 68, 0.05)', borderRadius: '16px', border: '1px solid rgba(239, 68, 68, 0.1)' }}>
               <p style={{ margin: 0, fontSize: '13px', color: 'var(--accent-red)', lineHeight: 1.5 }}>
                  <strong>Security Architecture:</strong> RemoteLink Pro is built on a physical-first authorization model. 
                  Stealth or background control is impossible at the engine core to protect user privacy.
               </p>
            </div>
          </Card>
        );
      case 'Setup Guide':
        return (
          <div className="grid">
             {[
               { s: 1, t: 'Initialize Engine', d: 'Ensure the Remote Engine is toggled ON in the application header.' },
               { s: 2, t: 'Configure Network', d: 'Connect your host PC and Android mobile to the same local Wi-Fi SSID.' },
               { s: 3, t: 'Pairing Handshake', d: 'Enter the 6-digit session code shown in the Pairing tab into your phone.' },
               { s: 4, t: 'Authorize Session', d: 'A request will appear on this screen. Click "Approve" to begin broadcasting.' }
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
