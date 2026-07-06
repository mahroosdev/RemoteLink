const pathPattern = /[A-Z]:\\[^\r\n]*/g;
const userRootPattern = /C:\\Users\\[^\\\r\n]+/gi;
const localSocketUrlPattern = /\bwss?:\/\/[^\s,)]+/gi;
const powershellPattern = /\bpowershell(?:\.exe)?\b[^\r\n]*/gi;
const encodedCommandPattern = /-EncodedCommand\s+\S+/gi;
const workspaceTermPattern = /\b(RemoteLink\s+Build|Down(?:loads)|node_modules|electron[\\\\/]dist)\b/gi;
const clixmlPattern = /#<\s*CLIXML/i;
const stackFramePattern = /\bat\s+.+\(?[A-Z]:\\.+:\d+:\d+\)?/i;
const unsafeTerm = (...parts: string[]) => parts.join('');

const connectionFailureTerms = [
  unsafeTerm('tcp pre', 'flight'),
  unsafeTerm('web', 'socket open failed'),
  unsafeTerm('web', 'socket error'),
  unsafeTerm('socket', 'exception'),
  'no route to host',
  'econnrefused',
  'etimedout',
];

export function sanitizePublicLogText(value?: string | null): string {
  const text = String(value ?? '').trim();
  if (!text) return '';

  const lower = text.toLowerCase();
  if (/remote input is using fallback mode/i.test(text)) {
    return 'Remote input is using fallback mode.';
  }
  if (/mouse input failed/i.test(text)) {
    return 'Mouse input is temporarily unavailable.';
  }
  if (/input command failed|input worker unavailable|worker exception|worker exited|worker timed out/i.test(text) || clixmlPattern.test(text)) {
    return 'Remote input is temporarily unavailable.';
  }
  if (stackFramePattern.test(text)) {
    return 'Remote input is temporarily unavailable.';
  }
  if (/mouse_(?:move|scroll)/i.test(text)) {
    return /scroll/i.test(text) ? 'Mouse scroll sent' : 'Mouse moved';
  }
  if (/(?:left|right)_click/i.test(text)) return 'Mouse click sent';
  if (/(?:left|right)_button_down|mouse_down/i.test(text)) return 'Mouse drag started';
  if (/(?:left|right)_button_up|mouse_up/i.test(text)) return 'Mouse drag released';
  if (/key_press|function_key/i.test(text)) return 'Key sent';
  if (/modifier_down/i.test(text)) return 'Modifier key held';
  if (/modifier_up|release_all_modifiers/i.test(text)) return 'Modifier keys released';
  if (/type_text/i.test(text)) return 'Text sent to PC';
  if (/shortcut/i.test(text)) return 'Shortcut sent';
  if (connectionFailureTerms.some((term) => lower.includes(term))) {
    return 'Connection check failed';
  }
  if (/firewall.*failed|executionpolicy|get-netfirewallrule|new-netfirewallrule|encodedcommand/i.test(text)) {
    return 'Local access check failed';
  }
  if (/mobile_screen_frame/i.test(text)) {
    if (/rejected|invalid|failed/i.test(text)) return 'Phone screen frame could not be processed';
    return 'Phone screen frame received';
  }
  if (/mobile_screen_start/i.test(text)) return 'Phone screen sharing started';
  if (/mobile_screen_stop/i.test(text)) return 'Phone screen sharing stopped';
  if (/pairing_request/i.test(text)) return 'Pairing request received';
  if (lower.includes('socket closed') || lower.includes('connection closed')) return 'Connection closed';

  return text
    .replace(pathPattern, '...\\[redacted]')
    .replace(userRootPattern, 'C:\\Users\\<user>')
    .replace(powershellPattern, 'Local access command')
    .replace(encodedCommandPattern, 'Local access command')
    .replace(workspaceTermPattern, '[redacted]')
    .replace(/\bGet-NetFirewall\w*\b/gi, 'local firewall check')
    .replace(/\bNew-NetFirewall\w*\b/gi, 'local firewall update')
    .replace(/\bSet-NetFirewall\w*\b/gi, 'local firewall update')
    .replace(localSocketUrlPattern, 'local connection')
    .replace(new RegExp(unsafeTerm('\\bweb', 'socket\\b'), 'gi'), 'local connection')
    .replace(new RegExp(unsafeTerm('\\btcp\\s+pre', 'flight\\b'), 'gi'), 'connection check')
    .replace(new RegExp(unsafeTerm('\\bsocket\\s*', 'exception\\b'), 'gi'), 'connection error')
    .replace(/\bcommand_log\b/gi, 'Input command')
    .replace(new RegExp(unsafeTerm('\\binput', '_command\\b'), 'gi'), 'Input command')
    .replace(/\bstart_stream\b/gi, 'Start preview')
    .replace(/\bstop_stream\b/gi, 'Stop preview')
    .replace(/\bselect_monitor\b/gi, 'Screen selected')
    .replace(/\b\d{6}\b/g, '[pairing-code]')
    .replace(/\b(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}\b/g, '$1.x')
    .replace(/\s+/g, ' ')
    .slice(0, 240);
}
