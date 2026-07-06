import React from 'react';
import { History, Filter, Trash2, Download, Info } from 'lucide-react';
import { Card, StatusPill, Button } from '../components/Common';
import { sanitizePublicLogText } from '../utils/publicLog';

const SessionsActivityPage = ({ state, onAction }: any) => {
  const [filter, setFilter] = React.useState('All');
  const [copyStatus, setCopyStatus] = React.useState<string | null>(null);
  
  const filteredLogs = filter === 'All' ? state.logs : state.logs.filter((l: any) => l.type === filter);
  const copyLogs = async () => {
    const exportPayload = {
      exportedAt: new Date().toISOString(),
      filter,
      logs: filteredLogs.map((log: any) => ({
        event: sanitizePublicLogText(log.event),
        type: log.type,
        timestamp: log.timestamp,
        device: sanitizePublicLogText(log.device || 'SYSTEM'),
        status: log.status,
      })),
    };
    try {
      const result = await window.remotelink.copyText(JSON.stringify(exportPayload, null, 2));
      setCopyStatus(result?.ok === false ? 'Log copy failed.' : 'Logs copied to clipboard.');
    } catch {
      setCopyStatus('Log copy failed.');
    }
  };

  return (
    <div className="grid">
      <div className="col-12" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
         <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Button variant={filter === 'All' ? 'primary' : 'secondary'} style={{ padding: '6px 14px' }} onClick={() => setFilter('All')}>All Events</Button>
            {['Pairing', 'Monitor', 'Keyboard', 'Mouse', 'Mobile', 'System'].map(t => (
              <Button key={t} variant={filter === t ? 'primary' : 'secondary'} style={{ padding: '6px 14px' }} onClick={() => setFilter(t)}>{t}</Button>
            ))}
         </div>
         <div style={{ display: 'flex', gap: '12px' }}>
            <Button variant="secondary" onClick={copyLogs}><Download size={14} /> Copy Logs</Button>
            <Button variant="secondary" onClick={() => onAction('CLEAR_LOG')}><Trash2 size={14} /> Reset History</Button>
         </div>
      </div>
      {copyStatus && (
        <div className="col-12" style={{ marginTop: '-4px', marginBottom: '8px' }}>
          <p className="text-muted" style={{ margin: 0, fontSize: '12px' }}>{copyStatus}</p>
        </div>
      )}

      <Card className="col-12" icon={History}>
         <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
               <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '16px', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>Event Signature</th>
                  <th style={{ padding: '16px', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>Module</th>
                  <th style={{ padding: '16px', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>Timestamp</th>
                  <th style={{ padding: '16px', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>Source Device</th>
                  <th style={{ padding: '16px', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>System Status</th>
               </tr>
            </thead>
            <tbody>
               {filteredLogs.map((l: any) => (
                 <tr key={l.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                    <td style={{ padding: '18px 16px', fontWeight: 500, fontSize: '14px' }}>{sanitizePublicLogText(l.event)}</td>
                    <td style={{ padding: '18px 16px' }}><StatusPill label={l.type} type="info" /></td>
                    <td style={{ padding: '18px 16px', color: 'var(--text-secondary)', fontSize: '13.5px' }}>{l.timestamp}</td>
                    <td style={{ padding: '18px 16px', color: 'var(--text-muted)', fontSize: '13.5px' }}>{sanitizePublicLogText(l.device || 'SYSTEM')}</td>
                    <td style={{ padding: '18px 16px' }}><StatusPill label={l.status} type={l.status.toLowerCase() as any} /></td>
                 </tr>
               ))}
            </tbody>
         </table>
         {filteredLogs.length === 0 && (
           <div style={{ padding: '80px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Info size={48} strokeWidth={1} style={{ marginBottom: '16px', opacity: 0.2 }} />
              <p style={{ fontSize: '15px' }}>No diagnostic records found for the selected module.</p>
           </div>
         )}
      </Card>
    </div>
  );
};

export default SessionsActivityPage;
