import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

import 'protocol.dart';

class RemoteMonitor {
  final String id;
  final String label;
  final bool primary;

  const RemoteMonitor({required this.id, required this.label, required this.primary});

  factory RemoteMonitor.fromJson(Map<String, dynamic> json) => RemoteMonitor(
        id: json['id']?.toString() ?? '',
        label: json['label']?.toString() ?? 'Screen',
        primary: json['primary'] == true,
      );
}

class PairingEvent {
  final String type;
  final String? sessionId;
  final String? message;
  final List<RemoteMonitor> monitors;

  const PairingEvent(this.type, {this.sessionId, this.message, this.monitors = const []});
}

class PairingService {
  WebSocketChannel? _channel;
  StreamSubscription<dynamic>? _subscription;
  final _events = StreamController<PairingEvent>.broadcast();
  final String deviceId = _createDeviceId();
  String? _sessionId;

  Stream<PairingEvent> get events => _events.stream;
  bool get isConnected => _channel != null && _sessionId != null;

  Future<void> connect(String hostIp, String pairingCode) async {
    await disconnect(sendMessage: false);
    final uri = Uri.parse('ws://$hostIp:$remoteLinkWsPort');
    final failureMessage =
        'Cannot reach PC at $uri. Check desktop engine is ON, phone and PC are on the same Wi-Fi, Windows Firewall allows Private network access, and try another Host IP shown in the desktop app.';
    try {
      _channel = WebSocketChannel.connect(uri);
      _subscription = _channel!.stream.listen(
        _handleMessage,
        onError: (_) => _events.add(PairingEvent(
          MessageTypes.error,
          message: failureMessage,
        )),
        onDone: () => _events.add(const PairingEvent(MessageTypes.disconnect, message: 'Connection closed by desktop')),
      );
      _send(remoteLinkMessage(
        type: MessageTypes.pairingRequest,
        deviceId: deviceId,
        payload: {
          'deviceName': _deviceName(),
          'deviceId': deviceId,
          'pairingCode': pairingCode,
          'appVersion': remoteLinkProtocolVersion,
        },
      ));
    } catch (error) {
      _events.add(PairingEvent(
        MessageTypes.error,
        message: failureMessage,
      ));
    }
  }

  void sendCommandLog(String command, Map<String, dynamic> details) {
    if (_channel == null || _sessionId == null) return;
    _send(remoteLinkMessage(
      type: MessageTypes.commandLog,
      deviceId: deviceId,
      sessionId: _sessionId,
      payload: {
        'command': command,
        'details': details,
      },
    ));
  }

  Future<void> disconnect({bool sendMessage = true}) async {
    if (sendMessage && _channel != null) {
      _send(remoteLinkMessage(
        type: MessageTypes.disconnect,
        deviceId: deviceId,
        sessionId: _sessionId,
        payload: {'reason': 'Disconnected from mobile'},
      ));
    }
    await _subscription?.cancel();
    await _channel?.sink.close();
    _subscription = null;
    _channel = null;
    _sessionId = null;
  }

  Future<void> dispose() async {
    await disconnect(sendMessage: false);
    await _events.close();
  }

  void _handleMessage(dynamic raw) {
    final decoded = jsonDecode(raw.toString());
    if (decoded is! Map<String, dynamic>) return;
    final type = decoded['type']?.toString();
    final payload = decoded['payload'] is Map<String, dynamic>
        ? decoded['payload'] as Map<String, dynamic>
        : <String, dynamic>{};

    switch (type) {
      case MessageTypes.pairingPending:
        _events.add(const PairingEvent(MessageTypes.pairingPending, message: 'Waiting for PC approval'));
        break;
      case MessageTypes.pairingApproved:
        _sessionId = payload['sessionId']?.toString() ?? decoded['sessionId']?.toString();
        final monitors = _readMonitors(payload['detectedMonitors']);
        _events.add(PairingEvent(MessageTypes.pairingApproved, sessionId: _sessionId, monitors: monitors));
        break;
      case MessageTypes.monitorList:
        _events.add(PairingEvent(MessageTypes.monitorList, monitors: _readMonitors(payload['detectedMonitors'])));
        break;
      case MessageTypes.pairingDenied:
        _events.add(PairingEvent(
          MessageTypes.pairingDenied,
          message: payload['reason']?.toString() ?? 'Pairing denied',
        ));
        break;
      case MessageTypes.disconnect:
        _events.add(PairingEvent(
          MessageTypes.disconnect,
          message: payload['reason']?.toString() ?? 'Connection closed by desktop',
        ));
        disconnect(sendMessage: false);
        break;
      case MessageTypes.error:
        _events.add(PairingEvent(
          MessageTypes.error,
          message: payload['reason']?.toString() ?? 'Desktop reported an error',
        ));
        break;
    }
  }

  List<RemoteMonitor> _readMonitors(dynamic value) {
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
