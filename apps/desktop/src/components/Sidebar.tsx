import React from 'react';
import { LayoutDashboard, Smartphone, Monitor, Gamepad2, History, Settings, BookOpen } from 'lucide-react';
import { AppLogo } from './Common';

const Sidebar = ({ activeTab, onTabChange, engineActive, connectedDevice }: { activeTab: string, onTabChange: (tab: string) => void, engineActive: boolean, connectedDevice: any }) => {
  const NavItem = ({ icon: Icon, label, tab }: any) => (
    <div className={`nav-item ${activeTab === tab ? 'active' : ''}`} onClick={() => onTabChange(tab)}>
      <Icon size={18} strokeWidth={2} /> <span>{label}</span>
    </div>
  );

  return (
    <aside className="sidebar">
      <div className="brand">
        <AppLogo size={28} />
        <div className="brand-text">
          <h1>REMOTELINK</h1>
          <p>Pro Utility</p>
        </div>
      </div>
      
      <nav className="nav-group">
        <NavItem icon={LayoutDashboard} label="Overview" tab="Overview" />
        <NavItem icon={Smartphone} label="Pairing & Devices" tab="Pairing" />
        <NavItem icon={Monitor} label="PC Monitors" tab="Monitors" />
        <NavItem icon={Gamepad2} label="Mobile Control" tab="Control" />
        <NavItem icon={History} label="Sessions / Activity" tab="Activity" />
        <div style={{ margin: '32px 0', height: '1px', background: 'var(--border-subtle)' }}></div>
        <NavItem icon={Settings} label="Settings & Guide" tab="Settings" />
        <NavItem icon={BookOpen} label="Manual" tab="Manual" />
      </nav>

      <div style={{ marginTop: 'auto', padding: '24px', background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <div style={{ 
            width: '8px', 
            height: '8px', 
            background: engineActive ? 'var(--accent-green)' : 'var(--text-muted)', 
            borderRadius: '50%',
            boxShadow: engineActive ? '0 0 10px var(--accent-green)' : 'none'
          }}></div>
          <span className="text-muted" style={{ fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px' }}>
            {engineActive ? (connectedDevice.status === 'Connected' ? 'Broadcasting active' : 'Engine active') : 'Engine Offline'}
          </span>
          </div>
          <p style={{ margin: '0 0 4px 0', fontSize: '13.5px', fontWeight: 500, color: 'var(--text-primary)' }}>
          {connectedDevice.status === 'Connected' ? 'RemoteLink Active' : 'Waiting for Device'}
          </p>
        <div style={{ width: '100%', height: '4px', background: 'var(--border-subtle)', borderRadius: '10px', overflow: 'hidden', marginTop: '12px' }}>
          <div style={{ width: engineActive ? '100%' : '0%', height: '100%', background: engineActive ? 'var(--accent-green)' : 'var(--text-muted)', transition: 'width 0.5s ease' }}></div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
