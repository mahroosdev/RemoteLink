import React from 'react';
import { Monitor, Play, Square, AlertCircle } from 'lucide-react';
import { Button, StatusPill } from './Common';

export const MonitorPreview = ({ 
  engineActive, 
  previewActive, 
  onTogglePreview, 
  videoRef 
}: { 
  engineActive: boolean, 
  previewActive: boolean, 
  onTogglePreview: () => void,
  videoRef: React.RefObject<HTMLVideoElement>
}) => {
  return (
    <div className="preview-container">
       {!engineActive ? (
         <div style={{ textAlign: 'center', opacity: 0.5 }}>
            <AlertCircle size={40} style={{ marginBottom: '16px' }} />
            <p style={{ fontSize: '13px', fontWeight: 600 }}>REMOTE ENGINE OFFLINE</p>
         </div>
       ) : !previewActive ? (
         <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Play size={48} style={{ marginBottom: '24px', opacity: 0.2 }} />
            <Button variant="primary" onClick={onTogglePreview}>
               <Play size={14} fill="currentColor" /> START LIVE PREVIEW
            </Button>
         </div>
       ) : (
         <>
            <video ref={videoRef} autoPlay className="preview-video"></video>
            <div style={{ position: 'absolute', bottom: '24px', right: '24px' }}>
               <Button 
                  className="btn-stop-preview" 
                  onClick={onTogglePreview}
                  style={{ backdropFilter: 'blur(10px)', padding: '12px 24px' }}
               >
                  <Square size={14} fill="currentColor" /> Stop Preview
               </Button>
            </div>
            <div style={{ position: 'absolute', top: '24px', left: '24px' }}>
               <StatusPill label="LIVE PREVIEW" type="success" />
            </div>
         </>
       )}
    </div>
  );
};
