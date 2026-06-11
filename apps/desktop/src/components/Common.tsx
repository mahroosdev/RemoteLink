import React from 'react';
import { Smartphone, Monitor, Wifi } from 'lucide-react';

export const AppLogo = ({ size = 24 }: { size?: number }) => (
  <div className="logo-container">
    <div style={{ position: 'relative', width: size, height: size }}>
       <Monitor size={size} strokeWidth={2.5} style={{ position: 'absolute', top: 0, left: 0 }} />
       <Smartphone size={size * 0.6} strokeWidth={3} style={{ 
         position: 'absolute', 
         bottom: -size * 0.1, 
         right: -size * 0.1,
         background: 'var(--text-primary)',
         borderRadius: '2px',
         padding: '1px'
       }} />
    </div>
  </div>
);

export const Button = ({ children, variant = 'secondary', className = "", ...props }: any) => {
  const variantClass = `btn-${variant}`;
  return (
    <button className={`btn ${variantClass} ${className}`} {...props}>
      {children}
    </button>
  );
};

export const Card = ({ title, icon: Icon, children, className = "", onClick }: any) => (
  <div className={`card ${className}`} onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
    {(title || Icon) && (
      <div className="card-header">
        {Icon && <Icon size={16} color="var(--text-muted)" />}
        {title && <h3>{title}</h3>}
      </div>
    )}
    {children}
  </div>
);

export const Toggle = ({ checked, onChange }: { checked: boolean, onChange: (val: boolean) => void }) => (
  <label className="toggle">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span className="slider"></span>
  </label>
);

export const Select = ({ value, onChange, options, disabled }: { value: any, onChange: (val: any) => void, options: string[] | {label: string, value: any}[], disabled?: boolean }) => (
  <select 
    value={value} 
    onChange={(e) => onChange(e.target.value)}
    disabled={disabled}
    style={{ 
      background: 'var(--bg-main)', 
      border: '1px solid var(--border-subtle)', 
      color: 'var(--text-primary)', 
      padding: '8px 12px', 
      borderRadius: '8px', 
      outline: 'none',
      fontSize: '13px',
      fontFamily: 'inherit',
      cursor: disabled ? 'not-allowed' : 'pointer'
    }}
  >
    {options.map((opt: any) => {
      const label = typeof opt === 'string' ? opt : opt.label;
      const val = typeof opt === 'string' ? opt : opt.value;
      return <option key={val} value={val}>{label}</option>;
    })}
  </select>
);

export const Range = ({ value, min = 1, max = 100, onChange, disabled }: { value: number, min?: number, max?: number, onChange: (val: number) => void, disabled?: boolean }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', opacity: disabled ? 0.3 : 1 }}>
    <input 
      type="range" 
      min={min} 
      max={max} 
      value={value} 
      disabled={disabled}
      onChange={(e) => onChange(parseInt(e.target.value))} 
    />
    <span style={{ fontSize: '12px', color: 'var(--text-muted)', width: '24px', fontWeight: 600 }}>{value}</span>
  </div>
);

export const StatusPill = ({ label, type = 'info' }: { label: string, type?: 'success' | 'warning' | 'error' | 'info' }) => {
  const typeClass = `badge-${type}`;
  return (
    <span className={`badge ${typeClass}`}>{label}</span>
  );
};
