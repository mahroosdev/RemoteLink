import React, { useState, useEffect, useRef } from 'react';
import { Monitor, CheckCircle2, RefreshCcw } from 'lucide-react';
import { Card, Button } from '../components/Common';
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
    } catch {
      setSources([]);
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
    if (!activeMonitor) return;
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
    } catch {
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
           <h2 style={{ fontSize: '22px', fontWeight: 500 }}>Local Desktop Preview</h2>
           <p className="text-muted">Inspect local desktop capture sources on this PC. Mobile streaming is controlled from the Android app.</p>
        </div>
        <Button onClick={refreshSources}><RefreshCcw size={14} /> Refresh Sources</Button>
      </div>

      <div className="col-8">
        <Card title="Local Capture Preview" icon={Monitor}>
           <MonitorPreview 
              engineActive={state.engineActive} 
              previewActive={state.previewActive} 
              onTogglePreview={() => onAction('TOGGLE_PREVIEW')} 
              videoRef={videoRef} 
           />
           <div style={{ marginTop: '32px', display: 'flex', justifyContent: 'space-between' }}>
              <div style={{ maxWidth: '480px' }}>
                 <p className="text-secondary" style={{ fontSize: '14px', marginBottom: '8px', fontWeight: 500 }}>Local preview only</p>
                 <p className="text-muted" style={{ fontSize: '13px', lineHeight: 1.6 }}>
                    This is a local preview on this PC only. It does not start, stop,
                    or change the screen shown on the paired phone.
                 </p>
              </div>
           </div>
        </Card>
      </div>

      <div className="col-4">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <h4 style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>Detected Screens</h4>
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
              <div style={{ padding: '12px', borderRadius: '12px', background: 'var(--bg-main)', border: '1px solid var(--border-subtle)' }}>
                 <p className="text-muted" style={{ margin: 0, fontSize: '12px', lineHeight: 1.5 }}>
                    Selects the local diagnostic preview source on this desktop. Phone preview screen selection is handled from the mobile app during a paired session.
                 </p>
              </div>
            </Card>
          ))}
          {state.monitors.length === 0 && (
            <Card style={{ background: 'var(--bg-sidebar)', padding: '20px' }}>
              <p className="text-muted" style={{ margin: 0, fontSize: '13px' }}>No desktop screens detected.</p>
            </Card>
          )}
          
          <Card title="Local Capture Sources" style={{ background: 'var(--bg-sidebar)', padding: '20px' }}>
             <p className="text-muted" style={{ margin: 0, fontSize: '13px', lineHeight: 1.6 }}>
                {sources.length > 0
                  ? `${sources.length} local capture source${sources.length === 1 ? '' : 's'} available for desktop preview. Source names are hidden in the normal app view.`
                  : 'Refresh sources to check whether this PC can provide a local desktop preview.'}
             </p>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default MonitorsPage;
