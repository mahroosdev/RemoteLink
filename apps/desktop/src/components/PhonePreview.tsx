import React from 'react';
import { Gamepad2 } from 'lucide-react';

export const PhonePreview = ({ rotation = 0, engineActive = false, connected = false }: { rotation?: number, engineActive?: boolean, connected?: boolean }) => {
  const isLandscape = rotation === 90;
  
  return (
    <div className={`phone-frame ${isLandscape ? 'phone-landscape' : 'phone-portrait'}`}>
       {/* Top Notch */}
       <div style={{ 
         position: 'absolute', 
         top: isLandscape ? '50%' : '12px', 
         left: isLandscape ? '12px' : '50%',
         transform: isLandscape ? 'translateY(-50%)' : 'translateX(-50%)',
         width: isLandscape ? '4px' : '60px',
         height: isLandscape ? '60px' : '4px',
         background: '#222',
         borderRadius: '2px',
         zIndex: 10
       }}></div>

       {/* Screen Content */}
       <div style={{ 
         width: '100%', 
         height: '100%', 
         background: '#050505', 
         display: 'flex', 
         flexDirection: 'column',
         alignItems: 'center',
         justifyContent: 'center',
         padding: '40px'
       }}>
          <Gamepad2 size={isLandscape ? 64 : 48} opacity={0.05} style={{ marginBottom: '16px' }} />
          <p style={{ 
            color: '#333', 
            fontSize: '12px', 
            fontWeight: 700, 
            textAlign: 'center', 
            textTransform: 'uppercase',
            letterSpacing: '1px'
          }}>
             {!engineActive ? 'Engine Offline' : !connected ? 'Waiting for Mobile' : 'Remote Session Active'}
          </p>
       </div>

       {/* Navigation Bar */}
       <div style={{ 
         position: 'absolute', 
         bottom: isLandscape ? 'auto' : '0',
         right: isLandscape ? '0' : 'auto',
         top: isLandscape ? '0' : 'auto',
         left: isLandscape ? 'auto' : '0',
         width: isLandscape ? '50px' : '100%',
         height: isLandscape ? '100%' : '50px',
         background: '#000',
         borderTop: isLandscape ? 'none' : '1px solid #111',
         borderLeft: isLandscape ? '1px solid #111' : 'none',
         display: 'flex',
         flexDirection: isLandscape ? 'column' : 'row',
         justifyContent: 'space-around',
         alignItems: 'center',
         padding: '10px'
       }}>
          <div style={{ width: '12px', height: '12px', border: '2px solid #333', borderRadius: '2px' }}></div>
          <div style={{ width: '14px', height: '14px', border: '2px solid #333', borderRadius: '50%' }}></div>
          <div style={{ width: '12px', height: '12px', border: '2px solid #333', borderRadius: '50%', borderLeftColor: 'transparent' }}></div>
       </div>
    </div>
  );
};
