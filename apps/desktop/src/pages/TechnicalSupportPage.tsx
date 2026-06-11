import React from 'react';
import { HelpCircle, AlertTriangle, Wifi, ShieldAlert, Zap, Keyboard, Monitor, BookOpen } from 'lucide-react';
import { Card } from '../components/Common';

const TechnicalSupportPage = ({ onAction }: any) => {
  const issues = [
    { icon: Wifi, title: 'Incorrect IP Address', desc: 'Ensure you are entering the address shown in the app header, not your public IP.' },
    { icon: AlertTriangle, title: 'Network Mismatch', desc: 'Discovery fails if devices are on different SSIDs or VLANs. Check your router settings.' },
    { icon: Zap, title: 'High Input Latency', desc: 'Use 5GHz Wi-Fi or a wired Ethernet connection for the host PC to minimize jitter.' },
    { icon: ShieldAlert, title: 'Firewall Blocking', desc: 'Windows Firewall might block incoming local P2P traffic. Add an exception for RemoteLink.' },
    { icon: Keyboard, title: 'Keys "Stuck" Held', desc: 'If Ctrl or Alt stay active, use the "Release All Keys" panic button in Shortcut settings.' },
    { icon: Monitor, title: 'Screen Not Switching', desc: 'The encoder requires a small delay to re-target a secondary monitor. Wait 2-3 seconds.' }
  ];

  return (
    <div className="grid">
       <div className="col-12">
          <Card title="Troubleshooting Knowledge Base" icon={HelpCircle}>
             <p className="text-muted" style={{ marginBottom: '32px' }}>Most connection issues can be resolved by checking your local network topology.</p>
             <div className="grid">
                {issues.map(i => (
                  <div key={i.title} className="col-6" style={{ padding: '20px', background: 'var(--bg-sidebar)', borderRadius: '16px', border: '1px solid var(--border-subtle)' }}>
                     <h4 style={{ margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '10px' }}><i.icon size={18} color="var(--accent-amber)" /> {i.title}</h4>
                     <p className="text-muted" style={{ margin: 0, fontSize: '13px', lineHeight: 1.5 }}>{i.desc}</p>
                  </div>
                ))}
             </div>
          </Card>
       </div>

       <div className="col-12" style={{ textAlign: 'center' }}>
          <div className="card" style={{ background: 'rgba(255,255,255,0.02)' }}>
             <BookOpen size={48} style={{ margin: '0 auto 16px', opacity: 0.2 }} />
             <h3>Detailed Documentation</h3>
             <p className="text-muted" style={{ maxWidth: '600px', margin: '0 auto 24px' }}>For a comprehensive guide on every feature, please visit our built-in user manual.</p>
             <button className="btn btn-primary" onClick={() => onAction('NAV', 'Manual')}>Open Manual</button>
          </div>
       </div>
    </div>
  );
};

export default TechnicalSupportPage;
