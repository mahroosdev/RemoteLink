import React from 'react';
import { Smartphone, ShieldCheck, ShieldAlert, Wifi, Info, ShieldOff, Monitor, Hash, Network } from 'lucide-react';
import { Card, StatusPill, Button } from '../components/Common';

const PairingDevicesPage = ({ state, onAction }: any) => {
  const hasRealRequest = Boolean(state.pendingRequest);
  const request = state.pendingRequest;
  const connectedDevice = state.connectedDevice?.status === 'Connected' ? state.connectedDevice : null;
  const selectedMonitor = state.monitors?.find((m: any) => m.protocolId === state.selectedMonitorId || m.isActive);

  return (
    <div className="grid">
      {/* Handshake Portal */}
      <div className="col-12" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
         <h2 style={{ fontSize: '24px', fontWeight: 600 }}>Security Handshake Portal</h2>
         <StatusPill label={state.engineActive ? "Discovery Active" : "Discovery Offline"} type={state.engineActive ? "success" : "info"} />
      </div>

      {/* Request / Connected Device Card */}
      <Card className="col-12" title={connectedDevice ? 'Connected Device' : 'Pending Authorization'} icon={connectedDevice ? Smartphone : Wifi}>
         {hasRealRequest && request ? (
           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-main)', padding: '24px', borderRadius: '16px', border: '1px solid var(--accent-amber)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                 <div className="logo-container" style={{ width: '64px', height: '64px', borderRadius: '16px', background: 'var(--bg-sidebar)', border: '1px solid var(--border-subtle)' }}>
                    <Smartphone size={32} strokeWidth={1.5} />
                 </div>
                 <div>
                    <h4 style={{ margin: '0 0 6px 0', fontSize: '18px', fontWeight: 600 }}>{request.deviceName}</h4>
                    <p className="text-muted" style={{ margin: 0, fontSize: '14px' }}>IP Request from <code style={{ color: 'var(--text-primary)' }}>{request.ip}</code></p>
                    <p className="text-muted" style={{ margin: '4px 0 0 0', fontSize: '12px' }}>
                      RemoteLink Mobile {request.appVersion}
                    </p>
                 </div>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                 <Button variant="primary" style={{ padding: '12px 32px' }} onClick={() => onAction('APPROVE')}>Approve</Button>
                 <Button variant="secondary" style={{ padding: '12px 32px' }} onClick={() => onAction('DENY')}>Deny</Button>
              </div>
           </div>
         ) : connectedDevice ? (
           <div style={{ background: 'var(--bg-main)', padding: '24px', borderRadius: '16px', border: '1px solid var(--border-subtle)' }}>
             <div style={{ display: 'flex', justifyContent: 'space-between', gap: '24px', alignItems: 'flex-start' }}>
               <div style={{ display: 'flex', alignItems: 'flex-start', gap: '20px', minWidth: 0 }}>
                 <div className="logo-container" style={{ width: '64px', height: '64px', borderRadius: '16px', background: 'var(--bg-sidebar)', border: '1px solid var(--border-subtle)', flex: '0 0 auto' }}>
                   <Smartphone size={32} strokeWidth={1.5} />
                 </div>
                 <div style={{ minWidth: 0 }}>
                   <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px', flexWrap: 'wrap' }}>
                     <h4 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>{connectedDevice.name}</h4>
                     <StatusPill label="CONNECTED" type="success" />
                   </div>
                   <p className="text-muted" style={{ margin: 0, fontSize: '13px' }}>Approved session active</p>
                   <p className="text-muted" style={{ margin: '4px 0 0 0', fontSize: '12px' }}>
                     {connectedDevice.os}{connectedDevice.appVersion ? ` ${connectedDevice.appVersion}` : ''}
                   </p>
                 </div>
               </div>
               <Button variant="danger" style={{ padding: '12px 22px', flex: '0 0 auto' }} onClick={() => onAction('DISCONNECT')}>
                 Disconnect
               </Button>
             </div>

             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '14px', marginTop: '24px' }}>
               <DeviceFact icon={Network} label="Device IP" value={connectedDevice.ip || 'Unknown'} />
               <DeviceFact icon={Hash} label="Device ID" value={connectedDevice.deviceId || 'Unavailable'} />
               <DeviceFact icon={Info} label="Client" value={connectedDevice.appVersion ? `RemoteLink Mobile ${connectedDevice.appVersion}` : connectedDevice.os || 'RemoteLink Mobile'} />
               <DeviceFact icon={Monitor} label="Selected Screen" value={selectedMonitor?.name ?? 'Screen unavailable'} />
             </div>

             <div style={{ borderTop: '1px solid var(--border-subtle)', marginTop: '20px', paddingTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
               <span className="text-muted" style={{ fontSize: '13px' }}>Detected screens available to mobile</span>
               <span style={{ fontWeight: 600, fontSize: '14px' }}>{state.monitors?.length ?? 0}</span>
             </div>
           </div>
         ) : (
           <div style={{ textAlign: 'center', padding: '48px' }}>
              <div style={{ opacity: 0.3 }}>
                 <ShieldCheck size={48} strokeWidth={1} style={{ marginBottom: '16px' }} />
                 <p style={{ fontSize: '15px' }}>
                    {state.engineActive
                      ? (state.connectedDevice.status === 'Connected'
                          ? 'A device is connected to this host.'
                          : 'Waiting for mobile pairing request on ws://HOST_IP:47777...')
                      : 'Start the engine to accept pairing requests.'}
                 </p>
              </div>
           </div>
         )}
      </Card>

      {/* Session Codes */}
      <Card className="col-4" title="Identity Token">
         <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <p className="text-muted" style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '1.5px' }}>Session Broadcast Code</p>
            <h2 style={{ fontSize: '42px', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: 'var(--accent-blue)', margin: '0 0 8px 0', letterSpacing: '4px' }}>{state.pairingCode}</h2>
            <p className="text-muted" style={{ fontSize: '12px', marginBottom: '24px' }}>Server: {state.serverStatus} · Port {state.port}</p>
            <Button variant="secondary" style={{ width: '100%' }} onClick={() => onAction('REGEN_CODE')}>Reset Session Token</Button>
         </div>
      </Card>

      <Card className="col-8" title="Phone Pairing Steps" icon={Wifi}>
         <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '14px' }}>
            {[
              'Start Remote Engine.',
              'Keep phone and PC on the same Wi-Fi.',
              'Enter the Recommended Host IP and Pairing Code on mobile.',
              'Approve the request on this PC.',
              'Allow RemoteLink Pro / Node / Electron through Windows Firewall on Private networks.',
              'If the phone cannot connect, try another detected LAN IP and avoid VirtualBox/VMware/WSL/Docker addresses.',
            ].map((text, index) => (
              <div key={text} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', color: 'var(--text-secondary)', fontSize: '13px', lineHeight: 1.5 }}>
                <span style={{ color: 'var(--accent-blue)', fontWeight: 700 }}>{index + 1}</span>
                <span>{text}</span>
              </div>
            ))}
         </div>
      </Card>

      {/* Device Whitelist */}
      <Card className="col-12" title="Authorized Hardware Whitelist" icon={ShieldCheck}>
         <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {state.trustedDevices.length > 0 ? state.trustedDevices.map((d: any) => (
              <div key={d.ip} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', background: 'var(--bg-main)', borderRadius: '16px', border: '1px solid var(--border-subtle)' }}>
                 <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <Smartphone size={20} color="var(--text-muted)" />
                    <div>
                      <p style={{ margin: 0, fontWeight: 500, fontSize: '14.5px' }}>{d.name}</p>
                      <p className="text-muted" style={{ margin: 0, fontSize: '11.5px' }}>{d.ip} • Last Authorized: {d.lastSeen}</p>
                    </div>
                 </div>
                 <Button variant="secondary" style={{ padding: '8px 14px', fontSize: '12px' }} onClick={() => onAction('REMOVE_TRUSTED', d.ip)}>
                    <ShieldOff size={14} /> Revoke Trust
                 </Button>
              </div>
            )) : (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border-subtle)', borderRadius: '16px' }}>
                 <Info size={24} strokeWidth={1.5} style={{ marginBottom: '12px', opacity: 0.5 }} />
                 <p style={{ fontSize: '13.5px' }}>No devices have been whitelisted for this host yet.</p>
              </div>
            )}
         </div>
      </Card>

      <div className="col-12">
         <Card style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.15)' }}>
            <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
               <ShieldAlert size={32} color="var(--accent-red)" />
               <div>
                  <h4 style={{ color: 'var(--accent-red)', fontWeight: 600, marginBottom: '4px' }}>Phase 1 Safety Notice</h4>
                  <p className="text-muted" style={{ margin: 0, fontSize: '13px', lineHeight: 1.5 }}>
                     Local WebSocket pairing requires the visible desktop engine, matching pairing code, and explicit host approval.
                     Mobile controls are logged as command_log messages only; no mouse or keyboard input is executed in Phase 1.
                  </p>
               </div>
            </div>
         </Card>
      </div>
    </div>
  );
};

const DeviceFact = ({ icon: Icon, label, value }: any) => (
  <div style={{ padding: '14px 16px', background: 'var(--bg-sidebar)', borderRadius: '12px', border: '1px solid var(--border-subtle)', minWidth: 0 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
      <Icon size={14} color="var(--text-muted)" />
      <span className="text-muted" style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px' }}>{label}</span>
    </div>
    <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={value}>
      {value}
    </p>
  </div>
);

export default PairingDevicesPage;
