import React from 'react';
import { ShieldCheck, ShieldOff, Smartphone } from 'lucide-react';
import { Button } from './Common';

const GlobalPairingRequest = ({ request, onApprove, onDeny }: any) => {
  if (!request) return null;

  return (
    <div style={{
      margin: '0 0 20px 0',
      padding: '18px 20px',
      borderRadius: '12px',
      border: '1px solid var(--accent-amber)',
      background: 'rgba(245, 158, 11, 0.08)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '20px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', minWidth: 0 }}>
        <div style={{
          width: '48px',
          height: '48px',
          borderRadius: '12px',
          background: 'var(--bg-sidebar)',
          border: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flex: '0 0 auto',
        }}>
          <Smartphone size={24} />
        </div>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', fontWeight: 600 }}>Phone waiting for approval</h3>
          <p className="text-muted" style={{ margin: 0, fontSize: '12px', lineHeight: 1.5 }}>
            {request.deviceName} · {request.ip || 'Unknown IP'} · ID {request.deviceId || 'Unavailable'}
          </p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '10px', flex: '0 0 auto' }}>
        <Button variant="primary" onClick={onApprove}><ShieldCheck size={14} /> Approve</Button>
        <Button variant="secondary" onClick={onDeny}><ShieldOff size={14} /> Deny</Button>
      </div>
    </div>
  );
};

export default GlobalPairingRequest;
