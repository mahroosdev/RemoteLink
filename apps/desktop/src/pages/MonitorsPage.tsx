import React, { useState, useEffect, useRef } from 'react';
import { Monitor, CheckCircle2, RefreshCcw } from 'lucide-react';
import { Card, Select, Button } from '../components/Common';
import { MonitorPreview } from '../components/MonitorPreview';

const MonitorsPage = ({ state, onAction }: any) => {
  const [sources, setSources] = useState<any[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    refreshSources();
  }, []);

  const refreshSources = async () => {
    try {
      const fetchedSources = await window.electronAPI.getDesktopSources();
      setSources(fetchedSources);
    } catch (err) {
      console.error('Failed to get sources:', err);
    }
  };

  useEffect(() => {
    if (state.previewActive && state.engineActive) {
      startStream();
    } else {
      stopStream();
    }
  }, [state.previewActive, state.engineActive, state.monitors.find((m:any) => m.isActive)?.id]);

  const startStream = async () => {
    const activeMonitor = state.monitors.find((m: any) => m.isActive);
    const source = sources.find(s => s.name.includes(activeMonitor.name)) || sources[0];
    
    if (!source) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: source.id,
            minWidth: 1280,
            maxWidth: 1920,
            minHeight: 720,
            maxHeight: 1080
          }
        } as any
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
      }
    } catch (e) {
      console.error('Stream error:', e);
      onAction('TOGGLE_PREVIEW');
    }
  };

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  return (
    <div className="grid">
      <div className="col-12" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
           <h2 style={{ fontSize: '22px', fontWeight: 500 }}>Monitor Configuration</h2>
           <p className="text-muted">Broadcast captured frame data to remote devices.</p>
        </div>
        <Button onClick={refreshSources}><RefreshCcw size={14} /> Rescan Interfaces</Button>
      </div>

      <div className="col-8">
        <Card title="Hardware Interface Preview" icon={Monitor}>
           <MonitorPreview 
              engineActive={state.engineActive} 
              previewActive={state.previewActive} 
              onTogglePreview={() => onAction('TOGGLE_PREVIEW')} 
              videoRef={videoRef} 
           />
           <div style={{ marginTop: '32px', display: 'flex', justifyContent: 'space-between' }}>
              <div style={{ maxWidth: '480px' }}>
                 <p className="text-secondary" style={{ fontSize: '14px', marginBottom: '8px', fontWeight: 500 }}>Capture Protocol: Desktop Duplication API</p>
                 <p className="text-muted" style={{ fontSize: '13px', lineHeight: 1.6 }}>
                    Direct memory access capture ensures sub-millisecond frame latency. 
                    Broadcast resolution is dynamically scaled based on network throughput.
                 </p>
              </div>
           </div>
        </Card>
      </div>

      <div className="col-4">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <h4 style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>Active Display Targets</h4>
          {state.monitors.map((m: any) => (
            <Card key={m.id} style={{ 
              borderColor: m.isActive ? 'var(--accent-blue)' : 'var(--border-subtle)',
              background: m.isActive ? 'var(--bg-card-elevated)' : 'var(--bg-card)',
              cursor: 'pointer',
              padding: '20px'
            }} onClick={() => onAction('SWITCH_MONITOR', m.id)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                   <h4 style={{ margin: '0 0 4px 0', fontSize: '16px', fontWeight: 600 }}>{m.name}</h4>
                   <p className="text-muted" style={{ fontSize: '12px' }}>{m.resolution} @ {m.refreshRate}</p>
                </div>
                {m.isActive && <CheckCircle2 size={18} color="var(--accent-green)" />}
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                 <div style={{ pointerEvents: 'none', opacity: 0.8 }}>
                    <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', fontWeight: 700 }}>PROFILE</label>
                    <Select value={m.quality} onChange={() => {}} options={['Low', 'Medium', 'High']} disabled />
                 </div>
                 <div style={{ pointerEvents: 'none', opacity: 0.8 }}>
                    <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', fontWeight: 700 }}>FPS CAP</label>
                    <Select value={String(m.fps)} onChange={() => {}} options={['30', '60', '120']} disabled />
                 </div>
              </div>
            </Card>
          ))}
          
          <Card title="Detected PIDs" style={{ background: 'var(--bg-sidebar)', padding: '20px' }}>
             <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {sources.slice(0, 4).map(s => (
                  <div key={s.id} style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                     {s.name} <span style={{ opacity: 0.5 }}>({s.id.split(':')[0]})</span>
                  </div>
                ))}
             </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default MonitorsPage;
