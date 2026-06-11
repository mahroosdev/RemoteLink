import React from 'react';
import { Power, Zap, Wifi } from 'lucide-react';
import { Button } from './Common';

const Header = ({ activeTab, localIP, engineActive, onToggleEngine }: any) => (
  <header className="top-header">
    <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
      <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 600 }}>{activeTab}</h2>
      <div style={{ width: '1px', height: '24px', background: 'var(--border-subtle)' }}></div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <Button 
          variant={engineActive ? 'danger' : 'primary'} 
          style={{ padding: '8px 16px', fontSize: '12px', borderRadius: '8px' }}
          onClick={onToggleEngine}
        >
          <Power size={14} strokeWidth={2.5} />
          {engineActive ? 'STOP ENGINE' : 'START ENGINE'}
        </Button>
        <span style={{ fontSize: '12px', fontWeight: 600, color: engineActive ? 'var(--accent-green)' : 'var(--text-muted)', letterSpacing: '0.5px' }}>
          {engineActive ? 'LOCAL ENGINE ACTIVE' : 'OFFLINE'}
        </span>
      </div>
    </div>
    
    <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)' }}>
        <Zap size={14} color={engineActive ? 'var(--accent-amber)' : 'var(--text-muted)'} />
        <span style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase' }}>Low Latency</span>
      </div>
      <div style={{ width: '1px', height: '24px', background: 'var(--border-subtle)' }}></div>
      <div style={{ textAlign: 'right' }}>
        <p style={{ margin: 0, fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>Host IP</p>
        <code style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{localIP}</code>
      </div>
      <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Wifi size={18} color="var(--text-muted)" style={{ margin: '0 auto' }} />
      </div>
    </div>
  </header>
);

export default Header;
