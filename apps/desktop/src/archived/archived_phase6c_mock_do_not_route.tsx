import React from 'react';
import { Gamepad2, RotateCcw, Camera, Power, Cpu, ShieldCheck, Info } from 'lucide-react';
import { Card, StatusPill, Button } from '../components/Common';
import { PhonePreview } from '../components/PhonePreview';

// Archived mock only. Do not route. Phase 6C requires separate planning and approval.
const ArchivedPhase6CMockDoNotRoute = ({ state, onAction }: any) => {
  const isConnected = state.engineActive && state.connectedDevice?.status === 'Connected';

  return (
    <div className="grid">
      <div className="col-12" style={{ textAlign: 'center', marginBottom: '12px' }}>
         <h2 style={{ fontSize: '24px', fontWeight: 600 }}>Interactive Mobile Control</h2>
         <p className="text-secondary">Simulate touch gestures and navigate your Android device remotely.</p>
      </div>

      <div className="col-8" style={{ display: 'flex', justifyContent: 'center' }}>
        <Card style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', minHeight: '750px', background: 'var(--bg-card-elevated)', position: 'relative' }}>
          <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', width: '100%' }}>
             <PhonePreview
                rotation={state.mobileRotation}
                engineActive={state.engineActive}
                connected={isConnected}
             />
          </div>

          <div style={{ display: 'flex', gap: '12px', padding: '32px 0 12px' }}>
             <Button variant="secondary" onClick={() => onAction('ROTATE_MOBILE')} disabled={!isConnected}>
                <RotateCcw size={16} /> <span>Rotate Screen</span>
             </Button>
             <Button variant="secondary" onClick={() => onAction('MOBILE_CMD', 'Capture')} disabled={!isConnected}>
                <Camera size={16} /> <span>Screenshot</span>
             </Button>
             <Button variant="danger" onClick={() => onAction('DISCONNECT')} disabled={!isConnected}>
                <Power size={16} /> <span>End Session</span>
             </Button>
          </div>
        </Card>
      </div>

      <div className="col-4">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
           <Card title="Input Protocol" icon={Cpu}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                 <div>
                    <h4 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>Remote Gestures</h4>
                    <p className="text-muted" style={{ fontSize: '13px', lineHeight: 1.4, marginBottom: '16px' }}>Coordinate translation for touch-panel simulation.</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                       <Button variant="secondary" style={{ fontSize: '12px' }} onClick={() => onAction('MOBILE_CMD', 'Tap Event')} disabled={!isConnected}>Mock Tap</Button>
                       <Button variant="secondary" style={{ fontSize: '12px' }} onClick={() => onAction('MOBILE_CMD', 'Swipe Event')} disabled={!isConnected}>Mock Swipe</Button>
                    </div>
                 </div>
                 <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '20px' }}>
                    <h4 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>Text Stream</h4>
                    <p className="text-muted" style={{ fontSize: '13px', lineHeight: 1.4, marginBottom: '16px' }}>Injection of PC keystrokes into remote OS input fields.</p>
                    <Button variant="secondary" style={{ width: '100%', fontSize: '12px' }} onClick={() => onAction('MOBILE_CMD', 'Text Injection')} disabled={!isConnected}>Inject Test Text</Button>
                 </div>
              </div>
           </Card>

           <Card title="Module Status" icon={ShieldCheck}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Accessibility Protocol</span>
                    <StatusPill label={isConnected ? "READY" : "OFFLINE"} type={isConnected ? "success" : "info"} />
                 </div>
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Frame Capture Bridge</span>
                    <StatusPill label={isConnected ? "ACTIVE" : "STANDBY"} type={isConnected ? "success" : "info"} />
                 </div>
              </div>
           </Card>

           <Card title="Privacy Notice" icon={Info} style={{ background: 'var(--bg-sidebar)' }}>
              <p className="text-muted" style={{ fontSize: '12.5px', lineHeight: 1.6, margin: 0 }}>
                 RemoteLink Pro only allows interaction with devices that have physically approved this PC as a controller.
                 Encrypted input channels prevent man-in-the-middle interception.
              </p>
           </Card>
        </div>
      </div>
    </div>
  );
};

export default ArchivedPhase6CMockDoNotRoute;
