import React, { useState } from 'react';
import { Smartphone, Monitor, Activity, ShieldCheck, Copy, RefreshCw, ArrowRight, Wifi, ShieldAlert } from 'lucide-react';
import { Card, StatusPill, Button } from '../components/Common';
import { getLocalAccessDisplay } from '../utils/firewallDisplay';
import { sanitizePublicLogText } from '../utils/publicLog';

const OverviewPage = ({ state, onAction }: any) => {
  const heldModifiers = state?.heldModifiers ?? [];
  const lastInputAt = state?.lastInputAt ?? null;
  const monitors = state?.monitors ?? [];
  const connectedDevice = state?.connectedDevice ?? null;
  const isConnected = Boolean(state?.engineActive && connectedDevice?.status === 'Connected');
  const isListening = Boolean(state?.engineActive && state?.serverStatus === 'listening' && connectedDevice?.status !== 'Connected');
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const fallbackIps = state?.hostIpFallbacks ?? [];
  const recommendedIps = state?.hostIpCandidates ?? [];
  const selectedMonitor = monitors.find((m: any) => m.protocolId === state?.selectedMonitorId || m.isActive);
  const stream = state?.previewStream ?? { status: 'stopped', fps: 0 };
  const streamActive = stream.status === 'active' || stream.status === 'starting';
  const streamLabel = stream.status === 'starting'
    ? 'Starting'
    : stream.status === 'active'
      ? 'Streaming'
      : stream.status === 'error'
        ? 'Error'
        : 'Stopped';
  const streamTone = stream.status === 'active' || stream.status === 'starting'
    ? 'var(--accent-green)'
    : stream.status === 'error'
      ? 'var(--accent-red)'
      : 'var(--text-muted)';
  const inputStatus = state?.inputStatus ?? 'idle';
  const inputStatusLabel = inputStatus === 'ready'
    ? 'Input Ready'
    : inputStatus === 'starting'
      ? 'Input Starting'
      : inputStatus === 'fallback'
        ? 'Input Fallback'
        : inputStatus === 'unavailable'
          ? 'Input Unavailable'
          : 'Idle';
  const inputStatusTone = inputStatus === 'ready'
    ? 'var(--accent-green)'
    : inputStatus === 'starting' || inputStatus === 'fallback'
      ? 'var(--accent-amber)'
      : inputStatus === 'unavailable'
        ? 'var(--accent-red)'
        : 'var(--text-muted)';
  const logs = state?.logs ?? [];
  const hasIncomingConnection = logs.some((log: any) => String(log.event ?? '').includes('Incoming mobile connection'));
  const hasPairingRequest = Boolean(state?.pendingRequest) || logs.some((log: any) => String(log.event ?? '').includes('Pairing request received'));
  const firewallStatus = state?.firewallStatus;
  const localAccess = getLocalAccessDisplay({
    engineActive: Boolean(state?.engineActive),
    approvedSessionConnected: Boolean(state?.engineActive && state?.connectedDevice?.status === 'Connected'),
    firewallStatus,
    logs,
  });
  const connectionHealth = !state?.engineActive
    ? { label: 'Offline', tone: 'info', text: 'Turn Engine Online before pairing a phone.' }
    : state?.serverStatus !== 'listening'
      ? { label: 'Starting', tone: 'warning', text: 'RemoteLink is preparing the local connection.' }
      : isConnected
        ? { label: 'Phone connected', tone: 'success', text: 'Approved local session is active.' }
        : hasPairingRequest
          ? { label: 'Approval needed', tone: 'warning', text: 'Approve the request on this PC to finish pairing.' }
          : hasIncomingConnection
            ? { label: 'Phone reached desktop', tone: 'warning', text: 'The phone reached this PC. Waiting for a valid pairing request.' }
            : { label: 'Waiting for device', tone: 'success', text: 'Ready for a phone on the same Wi-Fi or hotspot.' };

  const copyText = async (label: string, text: string) => {
    try {
      await window.remotelink.copyText(text);
      setCopyStatus(`${label} copied`);
      setTimeout(() => setCopyStatus(null), 1600);
    } catch {
      setCopyStatus('Copy failed');
      setTimeout(() => setCopyStatus(null), 2500);
    }
  };

  return (
    <div className="grid">
      {/* System Status Card */}
      <Card className="col-8" title="Connection Interface" icon={Activity}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
            <div style={{ 
              width: '100px', height: '100px', background: 'var(--bg-sidebar)', borderRadius: '24px', 
              display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
              border: '1px solid var(--border-subtle)'
            }}>
              <Smartphone size={48} strokeWidth={1.5} color={isConnected ? 'var(--text-primary)' : 'var(--text-muted)'} />
              {isConnected && <div className="status-dot" style={{ width: '20px', height: '20px', bottom: '-4px', right: '-4px' }}></div>}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '8px' }}>
                <h4 style={{ margin: 0, fontSize: '22px', fontWeight: 500 }}>
                  {!state?.engineActive ? 'Engine Offline' : isConnected ? connectedDevice?.name : 'Engine Online'}
                </h4>
                <StatusPill 
                  label={state?.serverStatus === 'error' ? 'ERROR' : !state?.engineActive ? 'STOPPED' : isConnected ? 'CONNECTED' : 'SERVER LISTENING'}
                  type={state?.serverStatus === 'error' ? 'error' : !state?.engineActive ? 'info' : isConnected ? 'success' : 'warning'}
                />
              </div>
              <p className="text-secondary" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
                <ShieldCheck size={16} color={isConnected ? 'var(--accent-green)' : 'var(--text-muted)'} />
                {state?.engineError
                  ? state.engineError
                  : isConnected
                    ? 'Local approved session active; mobile input can control this PC'
                    : isListening
                      ? 'Ready for local phone pairing'
                      : 'Start Remote Engine to listen for pairing requests'}
              </p>
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: '12px' }}>
             {isConnected ? (
               <Button variant="danger" onClick={() => onAction('DISCONNECT')}>Disconnect</Button>
             ) : (
               <Button onClick={() => onAction('NAV', 'Pairing')}>Pairing Hub <ArrowRight size={14} /></Button>
             )}
          </div>
        </div>
      </Card>

      {/* Recent activity */}
      <Card className="col-4" title="Recent Activity">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {state.logs.slice(0, 4).map((l: any) => (
            <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', paddingBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
              <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }}>{sanitizePublicLogText(l.event)}</span>
              <span className="text-muted" style={{ fontSize: '11px' }}>{l.timestamp}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card className="col-12" title="Connection Health" icon={Wifi}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: '12px' }}>
          <HealthItem label="Engine" value={state?.engineActive ? 'Online' : 'Offline'} ok={Boolean(state?.engineActive)} />
          <HealthItem label="Local Server" value={state?.serverStatus === 'listening' ? 'Listening' : state?.serverStatus ?? 'offline'} ok={state?.serverStatus === 'listening'} />
          <HealthItem label="Discovery" value={state?.discoveryStatus === 'listening' ? 'Listening' : state?.discoveryStatus ?? 'offline'} ok={state?.discoveryStatus === 'listening'} />
          <HealthItem label="Recommended Host IP" value={state?.localIP ?? 'Unavailable'} ok={Boolean(state?.localIP && state.localIP !== 'Local IP unavailable')} />
          <HealthItem label="Firewall" value={localAccess.healthLabel} ok={localAccess.healthOk} />
          <div style={{ padding: '14px 16px', background: 'var(--bg-sidebar)', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
              <span className="text-muted" style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Status</span>
              <span style={{ flex: '0 0 auto' }}>
                <StatusPill label={connectionHealth.label} type={connectionHealth.tone as any} />
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{connectionHealth.text}</p>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '14px', marginTop: '16px' }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '14px 16px', border: '1px solid var(--border-subtle)', borderRadius: '12px', background: 'var(--bg-main)' }}>
              <ShieldAlert size={18} color="var(--accent-amber)" style={{ flex: '0 0 auto' }} />
              <p className="text-muted" style={{ margin: 0, fontSize: '12px', lineHeight: 1.5 }}>
              {localAccess.kind === 'warning'
                ? 'Windows Firewall may be blocking RemoteLink. Open Pairing & Devices and use Fix Local Firewall Access.'
                : localAccess.kind === 'offline'
                  ? 'Start the Remote Engine to check local pairing access. No firewall action is needed while the engine is offline.'
                  : localAccess.kind === 'unknown'
                    ? `${localAccess.body} ${localAccess.secondary}`
                    : 'Local access is ready. If the phone cannot connect, check same Wi-Fi or hotspot, then use the Recommended Host IP.'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '14px 16px', border: '1px solid var(--border-subtle)', borderRadius: '12px', background: 'var(--bg-main)' }}>
            <ShieldCheck size={18} color="var(--accent-green)" style={{ flex: '0 0 auto' }} />
            <p className="text-muted" style={{ margin: 0, fontSize: '12px', lineHeight: 1.5 }}>
              RemoteLink connects over your trusted local network. Use only on trusted Wi-Fi or your own hotspot.
            </p>
          </div>
        </div>
      </Card>

      {/* Pairing Details */}
      <Card className="col-4" title="Pairing Details">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
           <div style={{ padding: '16px 20px', background: 'var(--bg-sidebar)', borderRadius: '16px', border: '1px solid var(--border-subtle)' }}>
              <p className="text-muted" style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '1px' }}>Pairing Code</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                 <code style={{ fontSize: '22px', fontWeight: 600, color: 'var(--accent-blue)', fontFamily: 'JetBrains Mono, monospace' }}>{state?.pairingCode ?? '------'}</code>
                 <div style={{ display: 'flex', gap: '12px' }}>
                    <IconAction label="Generate a new pairing code" onActivate={() => onAction('REGEN_CODE')}>
                      <RefreshCw size={16} className="text-muted" aria-hidden="true" />
                    </IconAction>
                    <IconAction label="Copy pairing code" onActivate={() => copyText('Pairing code', state?.pairingCode ?? '------')}>
                      <Copy size={16} className="text-muted" aria-hidden="true" />
                    </IconAction>
                 </div>
              </div>
           </div>
           <div style={{ padding: '16px 20px', background: 'var(--bg-sidebar)', borderRadius: '16px', border: '1px solid var(--border-subtle)' }}>
              <p className="text-muted" style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '1px' }}>Recommended Host IP</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                 <code style={{ fontSize: '15px', fontWeight: 700, fontFamily: 'monospace' }}>{state?.localIP ?? 'Local IP unavailable'}</code>
                 <IconAction label="Copy Host IP" onActivate={() => copyText('Host IP', state?.localIP ?? 'Local IP unavailable')}>
                   <Copy size={16} className="text-muted" aria-hidden="true" />
                 </IconAction>
              </div>
              <p className="text-muted" style={{ fontSize: '11px', margin: '8px 0 0 0' }}>Use this Host IP in the mobile app on the same Wi-Fi or hotspot.</p>
              {recommendedIps.length > 1 && (
                <select
                  value={state?.selectedHostIp ?? state?.localIP ?? ''}
                  onChange={(event) => onAction('SELECT_HOST_IP', event.target.value)}
                  style={{
                    width: '100%',
                    marginTop: '10px',
                    background: 'var(--bg-main)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    borderRadius: '8px',
                    padding: '8px 10px',
                    fontSize: '12px',
                    fontFamily: 'inherit',
                  }}
                >
                  {recommendedIps.map((ip: string, index: number) => (
                    <option key={ip} value={ip}>{index === 0 ? 'Recommended' : 'LAN'} - {ip}</option>
                  ))}
                </select>
              )}
              {recommendedIps.length > 1 && (
                <p className="text-muted" style={{ fontSize: '11px', margin: '8px 0 0 0', color: 'var(--accent-amber)' }}>
                  If the phone cannot connect, try another local IP from this list.
                </p>
              )}
              <p className="text-muted" style={{ fontSize: '11px', margin: '8px 0 0 0' }}>Use the Host IP from the same Wi-Fi or hotspot network as your phone.</p>
              {state?.localIP === 'Local IP unavailable' && (
                <p className="text-muted" style={{ fontSize: '11px', margin: '6px 0 0 0', color: 'var(--accent-amber)' }}>
                  Local IP unavailable. Check Wi-Fi/Ethernet and restart the Remote Engine.
                </p>
              )}
              {fallbackIps.length > 0 && (
                <p className="text-muted" style={{ fontSize: '11px', margin: '6px 0 0 0' }}>
                  Skipped addresses: {fallbackIps.join(', ')} (virtual adapters, not used for phone pairing).
                </p>
              )}
              {copyStatus && <p style={{ fontSize: '11px', margin: '8px 0 0 0', color: 'var(--accent-green)' }}>{copyStatus}</p>}
           </div>
        </div>
      </Card>

      {/* Display Summary */}
      <Card className="col-4" title="Displays" icon={Monitor}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {monitors.filter((m:any) => m.isActive).map((m: any) => (
            <div key={m.id}>
               <p style={{ fontSize: '15px', fontWeight: 500, marginBottom: '6px' }}>{m.name}</p>
               <p className="text-secondary" style={{ fontSize: '13px' }}>{m.resolution} @ {m.refreshRate}</p>
            </div>
          ))}
          {monitors.length === 0 && (
            <p className="text-muted" style={{ fontSize: '13px', lineHeight: 1.5 }}>
              No desktop screens detected. Start the engine after displays are connected.
            </p>
          )}
          <div style={{ borderTop: '1px solid var(--border-subtle)', marginTop: '8px', paddingTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
             <span className="text-muted">Detected screens</span>
             <span style={{ fontWeight: 600, fontSize: '14px' }}>{monitors.length}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
             <span className="text-muted">Selected screen</span>
             <span style={{ fontWeight: 600, fontSize: '14px' }}>{selectedMonitor?.name ?? '--'}</span>
          </div>
        </div>
      </Card>

      {/* Performance Summary */}
      <Card className="col-4" title="Metrics">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
           <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="text-secondary">Network Latency</span> 
              <span style={{ fontWeight: 600, color: isConnected ? 'var(--accent-green)' : 'var(--text-muted)' }}>{isConnected ? 'Local connection' : '--'}</span>
           </div>
           <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="text-secondary">Preview FPS</span>
              <span style={{ fontWeight: 600 }}>{streamActive ? stream.fps || '--' : '0'}</span>
           </div>
           <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="text-secondary">Preview Stream</span>
              <span style={{ fontWeight: 600, color: streamTone }}>{streamLabel}</span>
           </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
               <span className="text-secondary">Remote Control</span>
               <span style={{ fontWeight: 600, color: isConnected ? 'var(--accent-green)' : 'var(--text-muted)' }}>
                 {isConnected ? 'Active' : 'Idle'}
               </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
               <span className="text-secondary">Input Status</span>
               <span style={{ fontWeight: 600, color: inputStatusTone }}>{inputStatusLabel}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                 <span className="text-secondary">Last Input</span>
              <span style={{ fontWeight: 600, textAlign: 'right' }}>
                {lastInputAt ? new Date(lastInputAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--'}
              </span>
           </div>
           <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
              <span className="text-secondary">Held Modifiers</span>
              <span style={{ fontWeight: 600, textAlign: 'right' }}>
                {heldModifiers.length > 0 ? heldModifiers.join(' + ') : '--'}
              </span>
           </div>
           <Button
             variant="danger"
             onClick={() => onAction('RELEASE_ALL_KEYS')}
             disabled={!isConnected}
             style={{ marginTop: '4px' }}
           >
             Release All Keys
           </Button>
        </div>
      </Card>

    </div>
  );
};

// Accessible wrapper for icon-only actions: keyboard-focusable, screen-reader
// labelled, with a native hover tooltip. The icon itself stays decorative.
const IconAction = ({ label, onActivate, children }: { label: string; onActivate: () => void; children: React.ReactNode }) => (
  <span
    role="button"
    tabIndex={0}
    aria-label={label}
    title={label}
    style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
    onClick={onActivate}
    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onActivate(); } }}
  >
    {children}
  </span>
);

const HealthItem = ({ label, value, ok }: { label: string; value: string; ok: boolean }) => (
  <div style={{ padding: '14px 16px', background: 'var(--bg-sidebar)', borderRadius: '12px', border: '1px solid var(--border-subtle)', minWidth: 0 }}>
    <p className="text-muted" style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', margin: '0 0 8px 0' }}>{label}</p>
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
      <span style={{ width: '8px', height: '8px', borderRadius: '999px', background: ok ? 'var(--accent-green)' : 'var(--accent-amber)', flex: '0 0 auto' }} />
      <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={value}>
        {value}
      </p>
    </div>
  </div>
);

export default OverviewPage;

