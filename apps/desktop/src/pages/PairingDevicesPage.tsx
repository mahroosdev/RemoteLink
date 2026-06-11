import React, { useState } from 'react';
import { Smartphone, ShieldCheck, ShieldAlert, Wifi, Info, ShieldOff, Trash2 } from 'lucide-react';
import { Card, StatusPill, Button } from '../components/Common';

const PairingDevicesPage = ({ state, onAction }: any) => {
  // No fake incoming requests: a request card appears only when the user
  // explicitly simulates one (demo) — until real pairing is implemented.
  const [demoRequest, setDemoRequest] = useState(false);
  const canSimulate = state.engineActive && state.connectedDevice.status === 'Disconnected';
  const hasRequest = canSimulate && demoRequest;

  return (
    <div className="grid">
      {/* Handshake Portal */}
      <div className="col-12" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
         <h2 style={{ fontSize: '24px', fontWeight: 600 }}>Security Handshake Portal</h2>
         <StatusPill label={state.engineActive ? "Discovery Active" : "Discovery Offline"} type={state.engineActive ? "success" : "info"} />
      </div>

      {/* Active Request Card */}
      <Card className="col-12" title="Pending Authorization" icon={Wifi}>
         {hasRequest ? (
           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-main)', padding: '24px', borderRadius: '16px', border: '1px solid var(--accent-amber)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                 <div className="logo-container" style={{ width: '64px', height: '64px', borderRadius: '16px', background: 'var(--bg-sidebar)', border: '1px solid var(--border-subtle)' }}>
                    <Smartphone size={32} strokeWidth={1.5} />
                 </div>
                 <div>
                    <h4 style={{ margin: '0 0 6px 0', fontSize: '18px', fontWeight: 600 }}>Demo Android Device (Incoming)</h4>
                    <p className="text-muted" style={{ margin: 0, fontSize: '14px' }}>IP Request from <code style={{ color: 'var(--text-primary)' }}>192.168.0.102</code></p>
                    <p className="text-muted" style={{ margin: '4px 0 0 0', fontSize: '12px' }}>Demo request for UI testing only</p>
                 </div>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                 <Button variant="primary" style={{ padding: '12px 32px' }} onClick={() => { setDemoRequest(false); onAction('APPROVE'); }}>Approve</Button>
                 <Button variant="secondary" style={{ padding: '12px 32px' }} onClick={() => { setDemoRequest(false); onAction('DENY'); }}>Deny</Button>
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
                          : 'Waiting for mobile pairing request...')
                      : 'Start the engine to accept pairing requests.'}
                 </p>
              </div>
              {canSimulate && (
                <div style={{ marginTop: '24px' }}>
                   <Button variant="secondary" onClick={() => setDemoRequest(true)}>
                      Simulate pairing request (demo)
                   </Button>
                </div>
              )}
           </div>
         )}
      </Card>

      {/* Session Codes */}
      <Card className="col-4" title="Identity Token">
         <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <p className="text-muted" style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '1.5px' }}>Session Broadcast Code</p>
            <h2 style={{ fontSize: '42px', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: 'var(--accent-blue)', margin: '0 0 8px 0', letterSpacing: '4px' }}>{state.pairingCode}</h2>
            <p className="text-muted" style={{ fontSize: '12px', marginBottom: '24px' }}>Regenerates on engine restart or timeout.</p>
            <Button variant="secondary" style={{ width: '100%' }} onClick={() => onAction('REGEN_CODE')}>Reset Session Token</Button>
         </div>
      </Card>

      {/* Device Whitelist */}
      <Card className="col-8" title="Authorized Hardware Whitelist" icon={ShieldCheck}>
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
                  <h4 style={{ color: 'var(--accent-red)', fontWeight: 600, marginBottom: '4px' }}>Encryption Notice</h4>
                  <p className="text-muted" style={{ margin: 0, fontSize: '13px', lineHeight: 1.5 }}>
                     Every pairing handshake uses RSA-4096 / AES-256 GCM encryption. 
                     Authorization must be confirmed physically on this computer. 
                     RemoteLink Pro core prevents all forms of background stealth observation.
                  </p>
               </div>
            </div>
         </Card>
      </div>
    </div>
  );
};

export default PairingDevicesPage;
