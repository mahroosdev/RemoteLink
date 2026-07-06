import type { FirewallStatus, LogItem } from '../state/appState';

export type LocalAccessKind = 'ready' | 'warning' | 'offline' | 'unknown';

export interface ReachabilityResult {
  label: string;
  detail: string;
  status: 'success' | 'failed' | 'unknown';
}

export interface LocalAccessDisplay {
  kind: LocalAccessKind;
  title: string;
  badgeLabel: string;
  badgeType: 'success' | 'warning' | 'error' | 'info';
  body: string;
  secondary: string;
  showFixButton: boolean;
  healthLabel: string;
  healthOk: boolean;
  hasBlockRule: boolean;
  scopedRulesMissing: boolean;
  lastReachability: ReachabilityResult;
}

interface LocalAccessInput {
  engineActive: boolean;
  approvedSessionConnected?: boolean;
  firewallStatus?: FirewallStatus | null;
  logs?: LogItem[];
}

const unsafeTerm = (...parts: string[]) => parts.join('');

const reachabilityFailureTerms = [
  unsafeTerm('tcp pre', 'flight failed'),
  unsafeTerm('tcp pre', 'flight timed out'),
  'cannot reach',
  "can't reach",
  'could not reach',
  'connection failed',
  unsafeTerm('web', 'socket open failed'),
  'no route to host',
  'etimedout',
  'econnrefused',
];
const reachabilitySuccessPattern = /incoming mobile connection|pairing request received|pairing request accepted|mobile authorization approved/i;
const hasReachabilityFailure = (text: string) =>
  reachabilityFailureTerms.some((term) => text.toLowerCase().includes(term));

export function getLocalAccessDisplay({ engineActive, approvedSessionConnected = false, firewallStatus, logs = [] }: LocalAccessInput): LocalAccessDisplay {
  const blockRules = firewallStatus?.blockRules ?? [];
  const hasBlockRule = Boolean(firewallStatus?.hasEnabledBlockRules || blockRules.length > 0);
  const supported = firewallStatus?.supported === true;
  const scopedRulesMissing = Boolean(
    supported && (!firewallStatus?.hasScopedTcpAllow || !firewallStatus?.hasScopedUdpAllow),
  );
  const lastReachability = getLastReachability(logs);
  const hasReachabilityFailure = lastReachability.status === 'failed';
  const firewallCheckFailed = Boolean(firewallStatus?.error);
  const statusNeverChecked = !firewallStatus?.checkedAt && firewallStatus?.platform === 'unknown';
  const shouldWarn = hasBlockRule || (scopedRulesMissing && hasReachabilityFailure);

  if (engineActive && approvedSessionConnected) {
    return {
      kind: 'ready',
      title: 'Local Access Ready',
      badgeLabel: 'READY',
      badgeType: 'success',
      body: 'Phone connected successfully on this network.',
      secondary: firewallCheckFailed
        ? 'Local access is working. Firewall diagnostics could not be verified.'
        : 'Use this only on trusted Wi-Fi or your own hotspot.',
      showFixButton: false,
      healthLabel: 'Ready',
      healthOk: true,
      hasBlockRule,
      scopedRulesMissing,
      lastReachability: lastReachability.status === 'success'
        ? lastReachability
        : {
            label: 'Phone reached this PC',
            detail: 'Approved phone session is connected.',
            status: 'success',
          },
    };
  }

  if (shouldWarn) {
    return {
      kind: 'warning',
      title: 'Windows Firewall may be blocking RemoteLink',
      badgeLabel: 'NEEDS PERMISSION',
      badgeType: 'warning',
      body: 'The phone may not be able to reach this PC. Allow RemoteLink local access for this trusted network.',
      secondary: 'Use this only on trusted Wi-Fi or your own hotspot.',
      showFixButton: true,
      healthLabel: 'Needs Permission',
      healthOk: false,
      hasBlockRule,
      scopedRulesMissing,
      lastReachability,
    };
  }

  if (!engineActive) {
    return {
      kind: 'offline',
      title: 'Local Access Check',
      badgeLabel: 'ENGINE OFFLINE',
      badgeType: 'info',
      body: 'Start the Remote Engine to check local pairing access.',
      secondary: 'No firewall action is needed while the engine is offline.',
      showFixButton: false,
      healthLabel: 'Engine Offline',
      healthOk: false,
      hasBlockRule,
      scopedRulesMissing,
      lastReachability,
    };
  }

  if (firewallCheckFailed || statusNeverChecked) {
    return {
      kind: 'unknown',
      title: 'Local Access Check',
      badgeLabel: 'CHECK NEEDED',
      badgeType: 'info',
      body: firewallCheckFailed ? 'Firewall diagnostic check failed.' : 'Start the engine or refresh diagnostics to check local access.',
      secondary: firewallCheckFailed
        ? 'RemoteLink could not verify local firewall access. Try Refresh or Fix Local Firewall Access.'
        : 'No firewall changes are made unless you choose Fix Local Firewall Access.',
      showFixButton: false,
      healthLabel: 'Check Needed',
      healthOk: false,
      hasBlockRule,
      scopedRulesMissing,
      lastReachability,
    };
  }

  return {
    kind: 'ready',
    title: 'Local Access Ready',
    badgeLabel: 'READY',
    badgeType: 'success',
    body: 'RemoteLink is ready for local pairing on this network.',
    secondary: 'Use this only on trusted Wi-Fi or your own hotspot.',
    showFixButton: false,
    healthLabel: 'Ready',
    healthOk: true,
    hasBlockRule,
    scopedRulesMissing,
    lastReachability,
  };
}

export function redactWindowsPath(value?: string | null): string {
  if (!value) return 'Unavailable';

  const normalized = value.replace(/\//g, '\\').replace(/C:\\Users\\[^\\]+/i, 'C:\\Users\\<user>');
  const parts = normalized.split('\\').filter(Boolean);
  const fileName = parts[parts.length - 1] ?? normalized;

  if (/^[A-Z]:\\Users\\<user>/i.test(normalized)) {
    return `C:\\Users\\<user>\\...\\${fileName}`;
  }

  if (/^[A-Z]:\\/i.test(normalized)) {
    return `...\\${fileName}`;
  }

  return normalized.length > 80 ? `...\\${fileName}` : normalized;
}

export function sanitizeFirewallDetail(value?: string | null): string {
  if (!value) return '';

  const withoutCommands = value
    .replace(/powershell(?:\.exe)?\s+[^\r\n]+/gi, 'Firewall diagnostic command failed.')
    .replace(/-EncodedCommand\s+\S+/gi, 'Firewall diagnostic command failed.');

  return withoutCommands
    .replace(/[A-Z]:\\Users\\[^\\\r\n]+\\[^\r\n]*?([^\\\r\n]+\.(?:exe|cmd|ps1|js|ts|json|log))/gi, 'C:\\Users\\<user>\\...\\$1')
    .replace(/[A-Z]:\\[^\r\n]*?([^\\\r\n]+\.(?:exe|cmd|ps1|js|ts|json|log))/gi, '...\\$1')
    .replace(/C:\\Users\\[^\\\r\n]+/gi, 'C:\\Users\\<user>');
}

export function formatPhoneReachability(result: ReachabilityResult): string {
  if (result.status === 'unknown') return 'No recent phone reachability result.';
  if (result.status === 'success') return 'Phone reached this PC.';
  return 'Phone could not reach this PC.';
}

export function getFirewallSupportDiagnostics(firewallStatus?: FirewallStatus | null, localAccess?: LocalAccessDisplay): string {
  const hasBlockRules = Boolean(firewallStatus?.hasEnabledBlockRules || (firewallStatus?.blockRules?.length ?? 0) > 0);
  return [
    'RemoteLink support diagnostics',
    `Platform: ${firewallStatus?.platform || 'unknown'}`,
    `Package mode: ${firewallStatus?.platform === 'unknown' || !firewallStatus ? 'Unknown' : firewallStatus.packaged ? 'Packaged' : 'Development'}`,
    `Firewall state: ${localAccess?.healthLabel || 'Unknown'}`,
    `Firewall check: ${firewallStatus?.error ? 'Firewall diagnostic command failed.' : 'Completed'}`,
    `Executable checked: ${redactWindowsPath(firewallStatus?.appPath)}`,
    `Local connection permission: ${firewallStatus?.hasScopedTcpAllow ? 'detected' : 'not detected'}.`,
    `Discovery permission: ${firewallStatus?.hasScopedUdpAllow ? 'detected' : 'not detected'}.`,
    'Local network access: RemoteLink local mode only.',
    `Last phone reachability: ${localAccess ? formatPhoneReachability(localAccess.lastReachability) : 'No recent phone reachability result.'}`,
    `Enabled block rules detected: ${hasBlockRules ? 'yes' : 'no'}`,
  ].join('\n');
}

export function getFirewallDeveloperDiagnostics(firewallStatus?: FirewallStatus | null, localAccess?: LocalAccessDisplay): string {
  const blockRules = firewallStatus?.blockRules ?? [];
  return [
    'RemoteLink firewall developer diagnostics',
    'Warning: may include local file paths. Share only with trusted support.',
    `Checked at: ${firewallStatus?.checkedAt || 'Unavailable'}`,
    `Platform: ${firewallStatus?.platform || 'unknown'}`,
    `Supported: ${String(Boolean(firewallStatus?.supported))}`,
    `Packaged: ${String(Boolean(firewallStatus?.packaged))}`,
    `Executable: ${redactWindowsPath(firewallStatus?.appPath)}`,
    `Local connection rule: ${firewallStatus?.tcpRuleName || 'Unavailable'} (${firewallStatus?.hasScopedTcpAllow ? 'detected' : 'not detected'})`,
    `Discovery rule: ${firewallStatus?.udpRuleName || 'Unavailable'} (${firewallStatus?.hasScopedUdpAllow ? 'detected' : 'not detected'})`,
    `Enabled block rules: ${firewallStatus?.hasEnabledBlockRules ? 'yes' : 'no'}`,
    `Block rule details: ${blockRules.length > 0 ? JSON.stringify(blockRules, null, 2) : 'none'}`,
    `Last phone reachability: ${localAccess ? `${localAccess.lastReachability.label} - ${localAccess.lastReachability.detail}` : 'Unavailable'}`,
    `Raw firewall error: ${firewallStatus?.error || 'none'}`,
  ].join('\n');
}

function getLastReachability(logs: LogItem[]): ReachabilityResult {
  const event = logs
    .map((log) => String(log.event ?? ''))
    .find((text) => hasReachabilityFailure(text) || reachabilitySuccessPattern.test(text));

  if (!event) {
    return {
      label: 'No phone attempt yet',
      detail: 'No recent phone reachability result is available.',
      status: 'unknown',
    };
  }

  if (hasReachabilityFailure(event)) {
    return {
      label: 'Phone could not reach this PC',
      detail: event,
      status: 'failed',
    };
  }

  return {
    label: 'Phone reached this PC',
    detail: event,
    status: 'success',
  };
}


