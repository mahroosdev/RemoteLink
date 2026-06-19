const remoteLinkProtocolVersion = '1.0.0';
const remoteLinkWsPort = 47777;

class MessageTypes {
  static const pairingRequest = 'pairing_request';
  static const pairingPending = 'pairing_pending';
  static const pairingApproved = 'pairing_approved';
  static const pairingDenied = 'pairing_denied';
  static const heartbeat = 'heartbeat';
  static const monitorList = 'monitor_list';
  static const selectMonitor = 'select_monitor';
  static const commandLog = 'command_log';
  static const disconnect = 'disconnect';
  static const error = 'error';
}

Map<String, dynamic> remoteLinkMessage({
  required String type,
  String? deviceId,
  String? sessionId,
  Map<String, dynamic>? payload,
}) {
  return {
    'type': type,
    'timestamp': DateTime.now().toUtc().toIso8601String(),
    if (deviceId != null) 'deviceId': deviceId,
    if (sessionId != null) 'sessionId': sessionId,
    if (payload != null) 'payload': payload,
  };
}
