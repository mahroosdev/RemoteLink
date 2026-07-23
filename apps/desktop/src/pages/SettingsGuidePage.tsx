import React, { useState } from 'react';
import { BookOpen, CheckCircle2, KeyRound, Palette, ShieldCheck, Wifi } from 'lucide-react';
import { Button, Card, Select } from '../components/Common';

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
  const tabs = ['Appearance', 'Connection', 'Safety', 'Setup Guide'];
  const activeSettingsTab = tabs.includes(settingsTab) ? settingsTab : 'Appearance';
  const [releaseStatus, setReleaseStatus] = useState<string | null>(null);

  const releaseAllKeys = async () => {
    setReleaseStatus('Releasing keys...');
    try {
      await Promise.resolve(onAction('RELEASE_ALL_KEYS'));
      setReleaseStatus('All held modifier keys and mouse buttons were released.');
    } catch {
      setReleaseStatus('Could not release the controls. Disconnect and reconnect, then try again.');
    }
  };

  const renderTabContent = () => {
    switch (activeSettingsTab) {
      case 'Appearance':
        return (
          <Card>
            <SettingRow
              title="Desktop theme"
              description="Choose the appearance used throughout the RemoteLink desktop app."
            >
              <Select
                value={state.settings.general.theme}
                onChange={(value) => updateSettings('general', 'theme', value)}
                options={['Professional Dark', 'Pure Black', 'Light']}
              />
            </SettingRow>
            <div className="settings-note">
              <Palette size={18} />
              <p>Theme changes are saved on this PC and applied the next time RemoteLink opens.</p>
            </div>
          </Card>
        );
      case 'Connection':
        return (
          <Card>
            <SettingRow
              title="Desktop engine"
              description="The engine must be online before a phone can discover or connect to this PC."
            >
              <span className={`status-badge ${state.engineActive ? 'success' : ''}`}>
                {state.engineActive ? 'Online' : 'Offline'}
              </span>
            </SettingRow>
            <SettingRow
              title="Recommended host IP"
              description="Use this address for manual connection when automatic discovery is unavailable."
            >
              <code style={{ fontSize: '15px', fontWeight: 600, color: 'var(--accent-blue)' }}>
                {state.localIP}
              </code>
            </SettingRow>
            <SettingRow
              title="Current pairing code"
              description="Enter this code on the phone, then approve the request on this PC."
            >
              <code style={{ fontSize: '15px', fontWeight: 600, color: 'var(--accent-blue)' }}>
                {state.pairingCode}
              </code>
            </SettingRow>
            <div className="settings-note">
              <Wifi size={18} />
              <p>RemoteLink works on trusted local Wi-Fi or your own hotspot. It does not use a cloud relay.</p>
            </div>
          </Card>
        );
      case 'Safety':
        return (
          <Card>
            <SettingRow
              title="Host approval"
              description="Every new phone session requires the matching code and approval on this PC."
            >
              <span className="status-badge success">
                <CheckCircle2 size={14} /> Required
              </span>
            </SettingRow>
            <SettingRow
              title="Release remote input"
              description="Immediately releases held Ctrl, Shift, Alt, Win, and mouse buttons."
            >
              <Button variant="danger" onClick={releaseAllKeys}>
                <KeyRound size={16} /> Release All
              </Button>
            </SettingRow>
            {releaseStatus && (
              <p role="status" className="text-muted" style={{ margin: '12px 0 0', fontSize: '12px' }}>
                {releaseStatus}
              </p>
            )}
            <div className="settings-note settings-note-danger">
              <ShieldCheck size={18} />
              <p>Approve only phones you recognize. Disconnect the session when remote control is no longer needed.</p>
            </div>
          </Card>
        );
      case 'Setup Guide':
        return (
          <div className="grid">
            {[
              { s: 1, t: 'Start Desktop Engine', d: 'Open RemoteLink and turn Engine Online. The desktop will show its recommended host IP and pairing code.' },
              { s: 2, t: 'Use the Same Local Network', d: 'Connect the phone and PC to the same trusted Wi-Fi network or your own phone hotspot.' },
              { s: 3, t: 'Connect From Mobile', d: 'Scan for the desktop or enter the recommended host IP and pairing code manually.' },
              { s: 4, t: 'Approve the Phone', d: 'Approve the pairing request on this PC only when you recognize the requesting phone.' },
              { s: 5, t: 'Check Local Access', d: 'If connection fails, use Pairing & Devices to check or repair local Windows Firewall access.' },
              { s: 6, t: 'Disconnect When Finished', d: 'Disconnecting releases remote input and stops active screen streaming.' },
            ].map((item) => (
              <Card key={item.s} className="col-6" style={{ background: 'var(--bg-card-elevated)', padding: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '8px' }}>
                  <div className="guide-step-number">{item.s}</div>
                  <h4 style={{ fontSize: '16px', fontWeight: 600 }}>{item.t}</h4>
                </div>
                <p className="text-muted" style={{ margin: 0, fontSize: '13.5px', lineHeight: 1.5 }}>{item.d}</p>
              </Card>
            ))}
            <div className="col-12" style={{ textAlign: 'center', marginTop: '32px' }}>
              <Button variant="primary" style={{ padding: '14px 40px' }} onClick={() => onAction('NAV', 'Manual')}>
                <BookOpen size={18} /> <span>Open Application Manual</span>
              </Button>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="tabs-container" role="tablist" aria-label="Settings sections">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeSettingsTab === tab}
            className={`tab-btn ${activeSettingsTab === tab ? 'active' : ''}`}
            onClick={() => setSettingsTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>
      <div style={{ minHeight: '480px' }}>{renderTabContent()}</div>
    </div>
  );
};

export default SettingsGuidePage;
