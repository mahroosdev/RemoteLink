import React, { useEffect, useRef, useState } from 'react';
import { AppLogo } from './Common';

// Brief intro screen shown while the app opens: the RemoteLink logo with an
// animated loading line, then a fade-out into the main UI. Purely visual — the
// app mounts and initializes underneath it.
const SplashScreen = ({ onFinish }: { onFinish: () => void }) => {
  const [leaving, setLeaving] = useState(false);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  useEffect(() => {
    const leaveTimer = setTimeout(() => setLeaving(true), 1700);
    const doneTimer = setTimeout(() => onFinishRef.current(), 2200);
    return () => {
      clearTimeout(leaveTimer);
      clearTimeout(doneTimer);
    };
  }, []);

  return (
    <div
      className={`splash-screen ${leaving ? 'splash-leaving' : ''}`}
      role="status"
      aria-live="polite"
      aria-label="RemoteLink is starting"
    >
      <div className="splash-content">
        <div className="splash-logo">
          <AppLogo size={52} />
        </div>
        <h1 className="splash-title">REMOTELINK</h1>
        <p className="splash-subtitle">Pro Utility</p>
        <div className="splash-progress">
          <span className="splash-progress-bar" />
        </div>
        <p className="splash-hint">Starting…</p>
      </div>
    </div>
  );
};

export default SplashScreen;
