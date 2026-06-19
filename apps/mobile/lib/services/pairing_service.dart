import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

import 'protocol.dart';

class RemoteMonitor {
  final String id;
  final String label;
  final bool isPrimary;
  final int? width;
  final int? height;
  final double? scaleFactor;

  const RemoteMonitor({
    required this.id,
    required this.label,
    required this.isPrimary,
    this.width,
    this.height,
    this.scaleFactor,
  });

  factory RemoteMonitor.fromJson(Map<String, dynamic> json) => RemoteMonitor(
        id: json['id']?.toString() ?? '',
        label: json['label']?.toString() ?? 'Screen',
        isPrimary: json['isPrimary'] == true || json['primary'] == true,
        width: _readInt(json['width']),
        height: _readInt(json['height']),
        scaleFactor: _readDouble(json['scaleFactor']),
      );

  static int? _readInt(dynamic value) {
    if (value is int) return value;
    if (value is num) return value.round();
    return int.tryParse(value?.toString() ?? '');
  }

  static double? _readDouble(dynamic value) {
    if (value is double) return value;
    if (value is num) return value.toDouble();
    return double.tryParse(value?.toString() ?? '');
  }
}

class PairingEvent {
  final String type;
  final String? sessionId;
  final String? message;
  final List<RemoteMonitor> monitors;
  final String? selectedMonitorId;
  final int? attemptId;

  const PairingEvent(
    this.type, {
    this.sessionId,
    this.message,
    this.monitors = const [],
    this.selectedMonitorId,
    this.attemptId,
  });
}

class PairingService {
  WebSocketChannel? _channel;
  StreamSubscription<dynamic>? _subscription;
  Timer? _connectTimeout;
  final _events = StreamController<PairingEvent>.broadcast();
  String? _deviceId;
  String? _sessionId;
  int _attemptSequence = 0;
  int? _activeAttemptId;
  bool _pairingComplete = false;

  String get deviceId => _deviceId ??= _createDeviceId();
  Stream<PairingEvent> get events => _events.stream;
  bool get isConnected => _channel != null && _sessionId != null;

  Future<void> connect(String hostIp, String pairingCode) async {
    await disconnect(sendMessage: false);
    final cleanHostIp = hostIp.trim();
    final cleanPairingCode = pairingCode.trim();
    final attemptId = ++_attemptSequence;
    _activeAttemptId = attemptId;
    _pairingComplete = false;
    final uri = Uri.parse('ws://$cleanHostIp:$remoteLinkWsPort');
    final failureMessage = 'Cannot reach desktop engine at $uri';
    try {
      _channel = WebSocketChannel.connect(uri);
      _subscription = _channel!.stream.listen(
        (raw) => _handleMessage(attemptId, raw),
        onError: (_) => _failAttempt(attemptId, failureMessage),
        onDone: () => _handleSocketDone(attemptId),
      );
      _connectTimeout = Timer(const Duration(seconds: 9), () {
        _failAttempt(attemptId, 'Pairing request timed out');
      });
      _send(remoteLinkMessage(
        type: MessageTypes.pairingRequest,
        deviceId: deviceId,
        payload: {
          'deviceName': _deviceName(),
          'deviceId': deviceId,
          'pairingCode': cleanPairingCode,
          'appVersion': remoteLinkProtocolVersion,
        },
      ));
    } catch (error) {
      _failAttempt(attemptId, failureMessage);
    }
  }

  bool sendCommandLog(String command, Map<String, dynamic> details) {
    if (_channel == null || _sessionId == null) return false;
    _send(remoteLinkMessage(
      type: MessageTypes.commandLog,
      deviceId: deviceId,
      sessionId: _sessionId,
      payload: {
        'command': command,
        'details': details,
      },
    ));
    return true;
  }

  bool selectMonitor(String monitorId) {
    if (_channel == null || _sessionId == null || monitorId.isEmpty) {
      return false;
    }
    _send(remoteLinkMessage(
      type: MessageTypes.selectMonitor,
      deviceId: deviceId,
      sessionId: _sessionId,
      payload: {'monitorId': monitorId},
    ));
    return true;
  }

  Future<void> disconnect({bool sendMessage = true}) async {
    _activeAttemptId = null;
    _pairingComplete = false;
    final subscription = _subscription;
    final channel = _channel;
    if (sendMessage && channel != null) {
      _send(remoteLinkMessage(
        type: MessageTypes.disconnect,
        deviceId: deviceId,
        sessionId: _sessionId,
        payload: {'reason': 'Disconnected from mobile'},
      ));
    }
    _connectTimeout?.cancel();
    _subscription = null;
    _connectTimeout = null;
    _channel = null;
    _sessionId = null;
    await subscription?.cancel();
    unawaited(channel?.sink.close());
  }

  Future<void> dispose() async {
    await disconnect(sendMessage: false);
    await _events.close();
  }

  void _handleMessage(int attemptId, dynamic raw) {
    if (!_isCurrentAttempt(attemptId)) return;
    final decoded = jsonDecode(raw.toString());
    if (decoded is! Map<String, dynamic>) return;
    final type = decoded['type']?.toString();
    final payload = decoded['payload'] is Map<String, dynamic>
        ? decoded['payload'] as Map<String, dynamic>
        : <String, dynamic>{};

    switch (type) {
      case MessageTypes.pairingPending:
        _connectTimeout?.cancel();
        _connectTimeout = null;
        _emitIfCurrent(
            attemptId,
            const PairingEvent(
              MessageTypes.pairingPending,
              message: 'Waiting for PC approval',
            ));
        break;
      case MessageTypes.pairingApproved:
        _connectTimeout?.cancel();
        _connectTimeout = null;
        _sessionId = payload['sessionId']?.toString() ??
            decoded['sessionId']?.toString();
        _pairingComplete = true;
        final monitors = _readMonitors(payload);
        _emitIfCurrent(
            attemptId,
            PairingEvent(
              MessageTypes.pairingApproved,
              sessionId: _sessionId,
              monitors: monitors,
              selectedMonitorId: payload['selectedMonitorId']?.toString(),
            ));
        break;
      case MessageTypes.monitorList:
        _emitIfCurrent(
            attemptId,
            PairingEvent(
              MessageTypes.monitorList,
              monitors: _readMonitors(payload),
              selectedMonitorId: payload['selectedMonitorId']?.toString(),
            ));
        break;
      case MessageTypes.pairingDenied:
        _emitIfCurrent(
            attemptId,
            PairingEvent(
              MessageTypes.pairingDenied,
              message: _pairingDeniedMessage(payload['reason']?.toString()),
            ));
        _closeAttempt(attemptId);
        break;
      case MessageTypes.disconnect:
        _emitIfCurrent(
            attemptId,
            PairingEvent(
              MessageTypes.disconnect,
              message: payload['reason']?.toString() ??
                  'Connection closed by desktop',
            ));
        _closeAttempt(attemptId);
        break;
      case MessageTypes.error:
        _emitIfCurrent(
            attemptId,
            PairingEvent(
              MessageTypes.error,
              message:
                  payload['reason']?.toString() ?? 'Desktop reported an error',
            ));
        _closeAttempt(attemptId);
        break;
    }
  }

  bool _isCurrentAttempt(int attemptId) => _activeAttemptId == attemptId;

  void _emitIfCurrent(int attemptId, PairingEvent event) {
    if (!_isCurrentAttempt(attemptId) || _events.isClosed) return;
    _events.add(PairingEvent(
      event.type,
      sessionId: event.sessionId,
      message: event.message,
      monitors: event.monitors,
      selectedMonitorId: event.selectedMonitorId,
      attemptId: attemptId,
    ));
  }

  void _failAttempt(int attemptId, String message) {
    _emitIfCurrent(
        attemptId, PairingEvent(MessageTypes.error, message: message));
    _closeAttempt(attemptId);
  }

  void _handleSocketDone(int attemptId) {
    if (!_isCurrentAttempt(attemptId)) return;
    final message = _pairingComplete
        ? 'Connection closed by desktop'
        : 'Connection closed before pairing completed';
    _emitIfCurrent(
        attemptId, PairingEvent(MessageTypes.disconnect, message: message));
    _closeAttempt(attemptId);
  }

  void _closeAttempt(int attemptId) {
    if (!_isCurrentAttempt(attemptId)) return;
    _activeAttemptId = null;
    _pairingComplete = false;
    _connectTimeout?.cancel();
    _connectTimeout = null;
    final subscription = _subscription;
    final channel = _channel;
    _subscription = null;
    _channel = null;
    _sessionId = null;
    unawaited(subscription?.cancel());
    unawaited(channel?.sink.close());
  }

  String _pairingDeniedMessage(String? reason) {
    final normalized = (reason ?? '').toLowerCase();
    if (normalized.contains('invalid pairing code') ||
        normalized.contains('code')) {
      return 'Pairing code mismatch';
    }
    if (reason == null || reason.isEmpty) return 'Desktop rejected pairing';
    return reason;
  }

  List<RemoteMonitor> _readMonitors(Map<String, dynamic> payload) {
    final value = payload['monitors'] ?? payload['detectedMonitors'];
    if (value is! List) return const [];
    return value
        .whereType<Map<String, dynamic>>()
        .map(RemoteMonitor.fromJson)
        .where((monitor) => monitor.id.isNotEmpty)
        .toList(growable: false);
  }

  void _send(Map<String, dynamic> message) {
    _channel?.sink.add(jsonEncode(message));
  }

  static String _createDeviceId() {
    final random = Random.secure();
    final bytes = List<int>.generate(16, (_) => random.nextInt(256));
    return bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  }

  String _deviceName() {
    if (kIsWeb) return 'Web Preview Device';
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return 'Android Device';
      case TargetPlatform.iOS:
        return 'RemoteLink Mobile';
      case TargetPlatform.macOS:
      case TargetPlatform.windows:
      case TargetPlatform.linux:
      case TargetPlatform.fuchsia:
        return 'RemoteLink Mobile';
    }
  }
}
