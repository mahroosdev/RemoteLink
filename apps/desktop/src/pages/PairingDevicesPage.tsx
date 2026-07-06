import React, { useState } from 'react';
import { Smartphone, ShieldCheck, ShieldAlert, Wifi, Info, Monitor, Hash, Network, Copy, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Card, StatusPill, Button } from '../components/Common';
import {
  formatPhoneReachability,
  getFirewallSupportDiagnostics,
  getLocalAccessDisplay,
  redactWindowsPath,
  sanitizeFirewallDetail,
  type LocalAccessDisplay,
} from '../utils/firewallDisplay';
import { sanitizePublicLogText } from '../utils/publicLog';

const PairingDevicesPage = ({ state, onAction }: any) => {
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [showFirewallDetails, setShowFirewallDetails] = useState(false);
  const hasRealRequest = Boolean(state.pendingRequest);
  const request = state.pendingRequest;
  const connectedDevice = state.connectedDevice?.status === 'Connected' ? state.connectedDevice : null;
  const selectedMonitor = state.monitors?.find((m: any) => m.protocolId === state.selectedMonitorId || m.isActive);
  const recommendedHostIp = state.localIP ?? 'Local IP unavailable';
  const hostIpValid = recommendedHostIp !== 'Local IP unavailable' && recommendedHostIp.length > 0;
  const firewallStatus = state.firewallStatus;
  const localAccess = getLocalAccessDisplay({
    engineActive: Boolean(state.engineActive),
    approvedSessionConnected: Boolean(state.engineActive && state.connectedDevice?.status === 'Connected'),
    firewallStatus,
    logs: state.logs ?? [],
  });
  const lastConnectionLog = [...(state.logs ?? [])].find((log: any) =>
    /Incoming mobile connection|Pairing request|Remote Engine failed|Remote Engine error|Mobile Authorization|Session disconnected|tcp\\s+preflight|cannot reach|Connection failed/i
      .test(String(log.event ?? '')),
  );
  const doctor = connectionDoctor(state, localAccess, hostIpValid, lastConnectionLog);

  const copyText = async (label: string, text: string) => {
    try {
      await window.remotelink.copyText(text);
      setCopyStatus(`${label} copied`);
      setTimeout(() => setCopyStatus(null), 1600);
    } catch {
      setCopyStatus('Copy failed');
      setTimeout(() => setCopyStatus(null), 2400);
    }
  };

  return (
    <div className="grid">
      {/* Handshake Portal */}
      <div className="col-12" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
         <h2 style={{ fontSize: '24px', fontWeight: 600 }}>Local Connection Setup</h2>
         <StatusPill label={state.engineActive ? "Engine Online" : "Engine Offline"} type={state.engineActive ? "success" : "info"} />
      </div>

      <Card className="col-12" title="Desktop Connection Setup Wizard" icon={Wifi}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: '24px', alignItems: 'stretch' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px' }}>
              <SetupStatus label="Engine status" value={state.engineActive ? 'Online' : 'Offline'} ok={Boolean(state.engineActive)} />
              <SetupStatus label="Local server" value={state.serverStatus === 'listening' ? 'Listening' : 'Not listening'} ok={state.serverStatus === 'listening'} />
              <SetupStatus label="Discovery" value={state.discoveryStatus === 'listening' ? 'Listening' : state.discoveryStatus === 'error' ? 'Possible block' : 'Not listening'} ok={state.discoveryStatus === 'listening'} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <SetupValue
                label="Recommended Host IP"
                value={recommendedHostIp}
                ok={hostIpValid}
                onCopy={() => copyText('Host IP', recommendedHostIp)}
              />
              <SetupValue
                label="Pairing Code"
                value={state.pairingCode ?? '------'}
                ok={Boolean(state.pairingCode && state.pairingCode !== '------')}
                onCopy={() => copyText('Pairing code', state.pairingCode ?? '------')}
                action={<RefreshCw size={15} onClick={() => onAction('REGEN_CODE')} style={{ cursor: 'pointer' }} />}
              />
            </div>
            <div style={{ padding: '16px', border: '1px solid var(--border-subtle)', background: 'var(--bg-main)', borderRadius: '12px' }}>
              <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={16} color="var(--accent-green)" /> How to pair locally
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px 18px' }}>
                {[
                  'Open RemoteLink desktop.',
                  'Turn Engine Online.',
                  'Connect phone to the same Wi-Fi or your own hotspot.',
                  'Use the Recommended Host IP or scan.',
                  'Enter the Pairing Code on mobile.',
                  'Approve the pairing request on this PC.',
                ].map((text, index) => (
                  <div key={text} style={{ display: 'flex', gap: '8px', fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                    <span style={{ color: 'var(--accent-blue)', fontWeight: 700 }}>{index + 1}</span>
                    <span>{text}</span>
                  </div>
                ))}
              </div>
              {copyStatus && <p style={{ margin: '12px 0 0 0', color: 'var(--accent-green)', fontSize: '12px' }}>{copyStatus}</p>}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <FirewallPanel
              firewallStatus={firewallStatus}
              localAccess={localAccess}
              actionStatus={state.firewallActionStatus}
              showDetails={showFirewallDetails}
              setShowDetails={setShowFirewallDetails}
              onFix={() => onAction('FIX_FIREWALL')}
              onRefresh={() => onAction('REFRESH_FIREWALL')}
            />
            <div style={{ padding: '16px', border: '1px solid var(--border-subtle)', background: 'var(--bg-main)', borderRadius: '12px' }}>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldCheck size={16} color="var(--accent-green)" /> Local mode
              </h4>
              <p className="text-muted" style={{ margin: 0, fontSize: '12.5px', lineHeight: 1.5 }}>
                Internet is not required. Both devices must be on the same Wi-Fi or phone hotspot.
                Some hotspots block discovery scan; manual IP can still work. Avoid untrusted public Wi-Fi unless you understand the risk.
              </p>
            </div>
          </div>
        </div>
      </Card>

      <Card className="col-12" title="Connection Doctor" icon={ShieldAlert}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '12px' }}>
          <DoctorItem label="Engine" value={state.engineActive ? 'Online' : 'Offline'} ok={Boolean(state.engineActive)} />
          <DoctorItem label="Local Server" value={state.serverStatus === 'listening' ? 'Listening' : 'Not listening'} ok={state.serverStatus === 'listening'} />
          <DoctorItem label="Discovery" value={state.discoveryStatus === 'listening' ? 'Listening' : state.discoveryStatus === 'error' ? 'Possible block' : 'Not listening'} ok={state.discoveryStatus === 'listening'} />
          <DoctorItem label="Host IP" value={hostIpValid ? recommendedHostIp : 'Unavailable'} ok={hostIpValid} />
          <DoctorItem label="Firewall" value={doctor.firewallLabel} ok={doctor.firewallOk} />
          <DoctorItem label="Device" value={connectedDevice ? 'Connected' : hasRealRequest ? 'Waiting approval' : 'No phone connected'} ok={Boolean(connectedDevice)} />
          <DoctorItem label="Last attempt" value={doctor.lastAttempt} ok={doctor.lastAttemptOk} />
          <DoctorItem label="Next action" value={doctor.nextAction} ok={doctor.nextActionOk} />
        </div>
      </Card>

      {/* Request / Connected Device Card */}
      <Card className="col-12" title={connectedDevice ? 'Connected Device' : 'Pending Authorization'} icon={connectedDevice ? Smartphone : Wifi}>
         {hasRealRequest && request ? (
           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-main)', padding: '24px', borderRadius: '16px', border: '1px solid var(--accent-amber)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                 <div className="logo-container" style={{ width: '64px', height: '64px', borderRadius: '16px', background: 'var(--bg-sidebar)', border: '1px solid var(--border-subtle)' }}>
                    <Smartphone size={32} strokeWidth={1.5} />
                 </div>
                 <div>
                    <h4 style={{ margin: '0 0 6px 0', fontSize: '18px', fontWeight: 600 }}>{request.deviceName}</h4>
                    <p className="text-muted" style={{ margin: 0, fontSize: '14px' }}>IP Request from <code style={{ color: 'var(--text-primary)' }}>{request.ip}</code></p>
                    <p className="text-muted" style={{ margin: '4px 0 0 0', fontSize: '12px' }}>
                      RemoteLink Mobile {request.appVersion}
                    </p>
                 </div>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                 <Button variant="primary" style={{ padding: '12px 32px' }} onClick={() => onAction('APPROVE')}>Approve</Button>
                 <Button variant="secondary" style={{ padding: '12px 32px' }} onClick={() => onAction('DENY')}>Deny</Button>
              </div>
           </div>
         ) : connectedDevice ? (
           <div style={{ background: 'var(--bg-main)', padding: '24px', borderRadius: '16px', border: '1px solid var(--border-subtle)' }}>
             <div style={{ display: 'flex', justifyContent: 'space-between', gap: '24px', alignItems: 'flex-start' }}>
               <div style={{ display: 'flex', alignItems: 'flex-start', gap: '20px', minWidth: 0 }}>
                 <div className="logo-container" style={{ width: '64px', height: '64px', borderRadius: '16px', background: 'var(--bg-sidebar)', border: '1px solid var(--border-subtle)', flex: '0 0 auto' }}>
                   <Smartphone size={32} strokeWidth={1.5} />
                 </div>
                 <div style={{ minWidth: 0 }}>
                   <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px', flexWrap: 'wrap' }}>
                     <h4 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>{connectedDevice.name}</h4>
                     <StatusPill label="CONNECTED" type="success" />
                   </div>
                   <p className="text-muted" style={{ margin: 0, fontSize: '13px' }}>Approved session active</p>
                   <p className="text-muted" style={{ margin: '4px 0 0 0', fontSize: '12px' }}>
                     {connectedDevice.os}{connectedDevice.appVersion ? ` ${connectedDevice.appVersion}` : ''}
                   </p>
                 </div>
               </div>
               <Button variant="danger" style={{ padding: '12px 22px', flex: '0 0 auto' }} onClick={() => onAction('DISCONNECT')}>
                 Disconnect
               </Button>
             </div>

             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '14px', marginTop: '24px' }}>
               <DeviceFact icon={Network} label="Device IP" value={connectedDevice.ip || 'Unknown'} />
               <DeviceFact icon={Hash} label="Device ID" value={connectedDevice.deviceId || 'Unavailable'} />
               <DeviceFact icon={Info} label="Client" value={connectedDevice.appVersion ? `RemoteLink Mobile ${connectedDevice.appVersion}` : connectedDevice.os || 'RemoteLink Mobile'} />
               <DeviceFact icon={Monitor} label="Selected Screen" value={selectedMonitor?.name ?? 'Screen unavailable'} />
             </div>

             <div style={{ borderTop: '1px solid var(--border-subtle)', marginTop: '20px', paddingTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
               <span className="text-muted" style={{ fontSize: '13px' }}>Detected screens available to mobile</span>
               <span style={{ fontWeight: 600, fontSize: '14px' }}>{state.monitors?.length ?? 0}</span>
             </div>
           </div>
         ) : (
           <div style={{ textAlign: 'center', padding: '48px' }}>
              <div style={{ opacity: 0.3 }}>
                 <ShieldCheck size={48} strokeWidth={1} style={{ marginBottom: '16px' }} />
                 <p style={{ fontSize: '15px' }}>
                    {state.engineActive
                      ? (connectedDevice?.status === 'Connected'
                          ? 'A device is connected to this host.'
                          : 'Waiting for a phone on the same Wi-Fi or hotspot. Use the Recommended Host IP shown below.')
                      : 'Start the engine to accept pairing requests.'}
                 </p>
              </div>
           </div>
         )}
      </Card>

      <div className="col-12">
         <Card style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.15)' }}>
            <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
               <ShieldAlert size={32} color="var(--accent-red)" />
               <div>
                  <h4 style={{ color: 'var(--accent-red)', fontWeight: 600, marginBottom: '4px' }}>Remote Input Safety Notice</h4>
                  <p className="text-muted" style={{ margin: 0, fontSize: '13px', lineHeight: 1.5 }}>
                     Local pairing requires the visible desktop engine, matching pairing code, and explicit host approval.
                     Approved mobile devices can send real mouse and keyboard input to this PC. Only approve trusted devices,
                     use Release All Keys if modifiers become stuck, and disconnect to stop input and streaming. Use RemoteLink only on
                     trusted Wi-Fi or your own hotspot.
                  </p>
               </div>
            </div>
         </Card>
      </div>
    </div>
  );
};

const DeviceFact = ({ icon: Icon, label, value }: any) => (
  <div style={{ padding: '14px 16px', background: 'var(--bg-sidebar)', borderRadius: '12px', border: '1px solid var(--border-subtle)', minWidth: 0 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
      <Icon size={14} color="var(--text-muted)" />
      <span className="text-muted" style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px' }}>{label}</span>
    </div>
    <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={value}>
      {value}
    </p>
  </div>
);

const SetupStatus = ({ label, value, ok }: any) => (
  <div style={{ padding: '14px', border: '1px solid var(--border-subtle)', background: 'var(--bg-main)', borderRadius: '12px', minWidth: 0 }}>
    <p className="text-muted" style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', margin: '0 0 8px 0' }}>{label}</p>
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
      <span style={{ width: '8px', height: '8px', borderRadius: '999px', background: ok ? 'var(--accent-green)' : 'var(--accent-amber)', flex: '0 0 auto' }} />
      <span style={{ fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
    </div>
  </div>
);

const SetupValue = ({ label, value, ok, onCopy, action }: any) => (
  <div style={{ padding: '16px', border: '1px solid var(--border-subtle)', background: 'var(--bg-main)', borderRadius: '12px', minWidth: 0 }}>
    <p className="text-muted" style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', margin: '0 0 8px 0' }}>{label}</p>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', minWidth: 0 }}>
      <code style={{ fontSize: label.includes('Code') ? '26px' : '18px', fontWeight: 700, color: ok ? 'var(--accent-blue)' : 'var(--accent-amber)', fontFamily: 'JetBrains Mono, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {value}
      </code>
      <div style={{ display: 'flex', gap: '10px', color: 'var(--text-muted)', flex: '0 0 auto' }}>
        {action}
        <Copy size={15} onClick={onCopy} style={{ cursor: 'pointer' }} />
      </div>
    </div>
  </div>
);

const FirewallPanel = ({
  firewallStatus,
  localAccess,
  actionStatus,
  showDetails,
  setShowDetails,
  onFix,
  onRefresh,
}: {
  firewallStatus: any;
  localAccess: LocalAccessDisplay;
  actionStatus?: string | null;
  showDetails: boolean;
  setShowDetails: (show: boolean) => void;
  onFix: () => void;
  onRefresh: () => void;
}) => {
  const supported = firewallStatus?.supported;
  const blockRules = firewallStatus?.blockRules ?? [];
  const icon = localAccess.kind === 'warning'
    ? <AlertTriangle size={16} color="var(--accent-amber)" />
    : <ShieldCheck size={16} color="var(--accent-green)" />;
  const [diagnosticsCopyStatus, setDiagnosticsCopyStatus] = useState<string | null>(null);
  const supportDiagnostics = getFirewallSupportDiagnostics(firewallStatus, localAccess);
  const copySupportDiagnostics = async () => {
    try {
      await window.remotelink.copyText(supportDiagnostics);
      setDiagnosticsCopyStatus('Support diagnostics copied');
      setTimeout(() => setDiagnosticsCopyStatus(null), 1600);
    } catch {
      setDiagnosticsCopyStatus('Copy failed');
      setTimeout(() => setDiagnosticsCopyStatus(null), 2400);
    }
  };
  const scopedTcpLabel = firewallStatus?.hasScopedTcpAllow ? 'detected' : 'not detected';
  const scopedUdpLabel = firewallStatus?.hasScopedUdpAllow ? 'detected' : 'not detected';

  return (
    <div style={{ padding: '16px', border: '1px solid var(--border-subtle)', background: 'var(--bg-main)', borderRadius: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start', marginBottom: '10px' }}>
        <h4 style={{ margin: 0, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          {icon}
          {localAccess.title}
        </h4>
        <StatusPill label={localAccess.badgeLabel} type={localAccess.badgeType} />
      </div>
      <p className="text-muted" style={{ margin: 0, fontSize: '12.5px', lineHeight: 1.5 }}>
        {localAccess.body}
      </p>
      <p className="text-muted" style={{ margin: '8px 0 0 0', fontSize: '12px', lineHeight: 1.45 }}>
        {localAccess.secondary}
      </p>
      <div style={{ display: 'flex', gap: '10px', marginTop: '14px', flexWrap: 'wrap' }}>
        {localAccess.showFixButton && (
          <Button variant="primary" onClick={onFix} disabled={!supported} style={{ padding: '9px 14px', fontSize: '12.5px' }}>
            Fix Local Firewall Access
          </Button>
        )}
        <Button variant="secondary" onClick={onRefresh} style={{ padding: '9px 14px', fontSize: '12.5px' }}>
          Refresh
        </Button>
        <Button variant="secondary" onClick={() => setShowDetails(!showDetails)} style={{ padding: '9px 14px', fontSize: '12.5px' }}>
          {showDetails ? 'Hide Details' : 'Advanced Details'}
        </Button>
      </div>
      {actionStatus && (
        <p className="text-muted" style={{ margin: '10px 0 0 0', fontSize: '12px', lineHeight: 1.4 }}>{actionStatus}</p>
      )}
      {showDetails && (
        <div style={{ marginTop: '12px', padding: '12px', border: '1px solid var(--border-subtle)', borderRadius: '10px', background: 'var(--bg-sidebar)' }}>
          {blockRules.length > 0 && (
            <p className="text-muted" style={{ margin: '0 0 6px 0', fontSize: '11.5px', lineHeight: 1.45 }}>
              Detected block rule: <code>{blockRules.map((rule: any) => sanitizeFirewallDetail(rule.displayName)).join(', ')}</code>
            </p>
          )}
          <p className="text-muted" style={{ margin: '0 0 6px 0', fontSize: '11.5px', lineHeight: 1.45 }}>
            Local connection permission: {scopedTcpLabel}. Discovery permission: {scopedUdpLabel}.
          </p>
          <p className="text-muted" style={{ margin: '0 0 6px 0', fontSize: '11.5px', lineHeight: 1.45 }}>
            App path checked: <code>{redactWindowsPath(firewallStatus?.appPath)}</code>
          </p>
          <p className="text-muted" style={{ margin: '0 0 6px 0', fontSize: '11.5px', lineHeight: 1.45 }}>
            Local network access is limited to RemoteLink local mode.
          </p>
          <p className="text-muted" style={{ margin: '0 0 6px 0', fontSize: '11.5px', lineHeight: 1.45 }}>
            Last phone reachability: {formatPhoneReachability(localAccess.lastReachability)}
          </p>
          {firewallStatus?.error && (
            <p style={{ margin: '0 0 6px 0', fontSize: '11.5px', color: 'var(--accent-amber)', lineHeight: 1.45 }}>
              The firewall check could not complete.
            </p>
          )}
          {!supported && (
            <p className="text-muted" style={{ margin: '0 0 6px 0', fontSize: '11.5px', lineHeight: 1.45 }}>
              Automatic repair is not available on this platform. Use your firewall app to allow RemoteLink on your trusted local network only.
            </p>
          )}
          <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border-subtle)' }}>
            <Button variant="secondary" onClick={copySupportDiagnostics} style={{ padding: '8px 12px', fontSize: '12px' }}>
              Copy Support Diagnostics
            </Button>
            {diagnosticsCopyStatus && (
              <p className="text-muted" style={{ margin: '8px 0 0 0', fontSize: '11.5px', lineHeight: 1.45 }}>{diagnosticsCopyStatus}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const DoctorItem = ({ label, value, ok }: any) => (
  <div style={{ padding: '14px 16px', background: 'var(--bg-main)', borderRadius: '12px', border: '1px solid var(--border-subtle)', minWidth: 0 }}>
    <p className="text-muted" style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', margin: '0 0 8px 0' }}>{label}</p>
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
      <span style={{ width: '8px', height: '8px', borderRadius: '999px', background: ok ? 'var(--accent-green)' : 'var(--accent-amber)', flex: '0 0 auto' }} />
      <p style={{ margin: 0, fontSize: '12.5px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={value}>
        {value}
      </p>
    </div>
  </div>
);

function connectionDoctor(state: any, localAccess: LocalAccessDisplay, hostIpValid: boolean, lastConnectionLog: any) {
  const connected = state.connectedDevice?.status === 'Connected';
  const waitingApproval = Boolean(state.pendingRequest);
  const engineReady = state.engineActive && state.serverStatus === 'listening';
  const discoveryBlocked = state.discoveryStatus === 'error';
  const lastEvent = localAccess.lastReachability.status === 'unknown'
    ? String(lastConnectionLog?.event ?? 'No recent phone attempt')
    : localAccess.lastReachability.label;
  const sanitizedLastEvent = sanitizePublicLogText(lastEvent);
  const lastAttemptOk = localAccess.lastReachability.status === 'success' || /Incoming mobile connection|Pairing request|Mobile Authorization approved|listening/i.test(lastEvent);

  if (connected) {
    return {
      firewallLabel: localAccess.healthLabel,
      firewallOk: localAccess.healthOk,
      lastAttempt: 'Connected',
      lastAttemptOk: true,
      nextAction: 'Connected',
      nextActionOk: true,
    };
  }
  if (waitingApproval) {
    return {
      firewallLabel: localAccess.healthLabel,
      firewallOk: localAccess.healthOk,
      lastAttempt: 'Waiting approval',
      lastAttemptOk: true,
      nextAction: 'Approve request',
      nextActionOk: false,
    };
  }
  if (!state.engineActive) {
    return {
      firewallLabel: localAccess.healthLabel,
      firewallOk: localAccess.healthOk,
      lastAttempt: sanitizedLastEvent,
      lastAttemptOk,
      nextAction: 'Turn Engine Online',
      nextActionOk: false,
    };
  }
  if (!engineReady) {
    return {
      firewallLabel: localAccess.healthLabel,
      firewallOk: localAccess.healthOk,
      lastAttempt: sanitizedLastEvent,
      lastAttemptOk,
      nextAction: 'Wait for listening',
      nextActionOk: false,
    };
  }
  if (!hostIpValid) {
    return {
      firewallLabel: localAccess.healthLabel,
      firewallOk: localAccess.healthOk,
      lastAttempt: sanitizedLastEvent,
      lastAttemptOk,
      nextAction: 'Check network IP',
      nextActionOk: false,
    };
  }
  if (localAccess.kind === 'warning') {
    return {
      firewallLabel: localAccess.healthLabel,
      firewallOk: localAccess.healthOk,
      lastAttempt: sanitizedLastEvent,
      lastAttemptOk,
      nextAction: 'Fix firewall access',
      nextActionOk: false,
    };
  }
  if (discoveryBlocked) {
    return {
      firewallLabel: localAccess.healthLabel,
      firewallOk: localAccess.healthOk,
      lastAttempt: 'Discovery blocked',
      lastAttemptOk: false,
      nextAction: 'Use manual IP',
      nextActionOk: false,
    };
  }
  return {
    firewallLabel: localAccess.healthLabel,
    firewallOk: localAccess.healthOk,
      lastAttempt: sanitizedLastEvent,
    lastAttemptOk,
    nextAction: 'Ready for phone',
    nextActionOk: true,
  };
}

export default PairingDevicesPage;




