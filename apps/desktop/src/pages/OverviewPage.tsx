import React, { useState } from 'react';
import { Smartphone, Monitor, Activity, ShieldCheck, Copy, RefreshCw, ArrowRight } from 'lucide-react';
import { Card, StatusPill, Button } from '../components/Common';

const OverviewPage = ({ state, onAction }: any) => {
  const isConnected = state.engineActive && state.connectedDevice.status === 'Connected';
  const isListening = state.engineActive && state.serverStatus === 'listening' && state.connectedDevice.status !== 'Connected';
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const fallbackIps = state.hostIpFallbacks ?? [];
  const recommendedIps = state.hostIpCandidates ?? [];
  const selectedMonitor = state.monitors.find((m: any) => m.protocolId === state.selectedMonitorId || m.isActive);

  const copyText = async (label: string, text: string) => {
    try {
      await window.remotelink.copyText(text);
      setCopyStatus(`${label} copied`);
      setTimeout(() => setCopyStatus(null), 1600);
    } catch (error) {
      setCopyStatus(error instanceof Error ? error.message : 'Copy failed');
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
                  {!state.engineActive ? 'Engine Offline' : isConnected ? state.connectedDevice.name : 'Engine Online'}
                </h4>
                <StatusPill 
                  label={state.serverStatus === 'error' ? 'ERROR' : !state.engineActive ? 'STOPPED' : isConnected ? 'CONNECTED' : 'SERVER LISTENING'}
                  type={state.serverStatus === 'error' ? 'error' : !state.engineActive ? 'info' : isConnected ? 'success' : 'warning'}
                />
              </div>
              <p className="text-secondary" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
                <ShieldCheck size={16} color={isConnected ? 'var(--accent-green)' : 'var(--text-muted)'} />
                {state.engineError
                  ? state.engineError
                  : isConnected
                    ? 'Local approved session active; commands are logged only'
                    : isListening
                      ? `Server Listening at ws://${state.localIP}:${state.port}`
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

      {/* Handshake Details */}
      <Card className="col-4" title="Handshake Details">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
           <div style={{ padding: '16px 20px', background: 'var(--bg-sidebar)', borderRadius: '16px', border: '1px solid var(--border-subtle)' }}>
              <p className="text-muted" style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '1px' }}>Pairing Code</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                 <code style={{ fontSize: '22px', fontWeight: 600, color: 'var(--accent-blue)', fontFamily: 'JetBrains Mono, monospace' }}>{state.pairingCode}</code>
                 <div style={{ display: 'flex', gap: '12px' }}>
                    <RefreshCw size={16} className="text-muted" style={{ cursor: 'pointer' }} onClick={() => onAction('REGEN_CODE')} />
                    <Copy size={16} className="text-muted" style={{ cursor: 'pointer' }} onClick={() => copyText('Pairing code', state.pairingCode)} />
                 </div>
              </div>
           </div>
           <div style={{ padding: '16px 20px', background: 'var(--bg-sidebar)', borderRadius: '16px', border: '1px solid var(--border-subtle)' }}>
              <p className="text-muted" style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '1px' }}>Recommended Host IP</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                 <code style={{ fontSize: '15px', fontWeight: 700, fontFamily: 'monospace' }}>{state.localIP}</code>
                 <Copy size={16} className="text-muted" style={{ cursor: 'pointer' }} onClick={() => copyText('Host IP', state.localIP)} />
              </div>
              <code style={{ display: 'block', marginTop: '8px', fontSize: '12px', color: 'var(--accent-blue)', fontFamily: 'monospace' }}>ws://{state.localIP}:{state.port}</code>
              {recommendedIps.length > 1 && (
                <select
                  value={state.selectedHostIp}
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
              <p className="text-muted" style={{ fontSize: '11px', margin: '8px 0 0 0' }}>Use the Host IP from the same Wi-Fi or hotspot network as your phone.</p>
              {state.localIP === 'Local IP unavailable' && (
                <p className="text-muted" style={{ fontSize: '11px', margin: '6px 0 0 0', color: 'var(--accent-amber)' }}>
                  Local IP unavailable. Check Wi-Fi/Ethernet and restart the Remote Engine.
                </p>
              )}
              {fallbackIps.length > 0 && (
                <p className="text-muted" style={{ fontSize: '11px', margin: '6px 0 0 0' }}>
                  Advanced ignored IPs: {fallbackIps.join(', ')}. Virtual adapter - not for phone pairing.
                </p>
              )}
              {copyStatus && <p style={{ fontSize: '11px', margin: '8px 0 0 0', color: 'var(--accent-green)' }}>{copyStatus}</p>}
           </div>
        </div>
      </Card>

      {/* Display Summary */}
      <Card className="col-4" title="Broadcasting" icon={Monitor}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {state.monitors.filter((m:any) => m.isActive).map((m: any) => (
            <div key={m.id}>
               <p style={{ fontSize: '15px', fontWeight: 500, marginBottom: '6px' }}>{m.name}</p>
               <p className="text-secondary" style={{ fontSize: '13px' }}>{m.resolution} @ {m.refreshRate}</p>
            </div>
          ))}
          {state.monitors.length === 0 && (
            <p className="text-muted" style={{ fontSize: '13px', lineHeight: 1.5 }}>
              No desktop screens detected. Start the engine after displays are connected.
            </p>
          )}
          <div style={{ borderTop: '1px solid var(--border-subtle)', marginTop: '8px', paddingTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
             <span className="text-muted">Detected screens</span>
             <span style={{ fontWeight: 600, fontSize: '14px' }}>{state.monitors.length}</span>
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
              <span style={{ fontWeight: 600, color: isConnected ? 'var(--accent-green)' : 'var(--text-muted)' }}>{isConnected ? '12ms' : '--'}</span>
           </div>
           <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="text-secondary">Stream Bitrate</span> 
              <span style={{ fontWeight: 600 }}>{isConnected ? '4.8 Mbps' : '0.0 Mbps'}</span>
           </div>
           <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="text-secondary">Encoder FPS</span> 
              <span style={{ fontWeight: 600 }}>{isConnected ? '60' : '0'}</span>
           </div>
        </div>
      </Card>

      {/* Activity Pipeline */}
      <Card className="col-4" title="Event Stream">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {state.logs.slice(0, 4).map((l: any) => (
            <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', paddingBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
              <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }}>{l.event}</span>
              <span className="text-muted" style={{ fontSize: '11px' }}>{l.timestamp}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

export default OverviewPage;
