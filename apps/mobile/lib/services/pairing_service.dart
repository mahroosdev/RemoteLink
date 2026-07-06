import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

import 'mobile_screen_share_service.dart';
import 'protocol.dart';
import 'websocket_connector.dart';

const pairingDiagnosticEvent = 'connection_diagnostic';
const remoteLinkDebugInput =
    bool.fromEnvironment('REMOTELINK_DEBUG_INPUT', defaultValue: false);

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
  final StreamFrame? frame;
  final String? streamStatus;
  final int? attemptId;
  final String? mobileScreenStatus;
  final int? mobileScreenWidth;
  final int? mobileScreenHeight;
  final int? mobileScreenFps;
  final String? mobileScreenLastFrameAt;

  const PairingEvent(
    this.type, {
    this.sessionId,
    this.message,
    this.monitors = const [],
    this.selectedMonitorId,
    this.frame,
    this.streamStatus,
    this.attemptId,
    this.mobileScreenStatus,
    this.mobileScreenWidth,
    this.mobileScreenHeight,
    this.mobileScreenFps,
    this.mobileScreenLastFrameAt,
  });
}

class StreamFrame {
  static const maxBase64Chars = 2500000;
  final String monitorId;
  final String format;
  final int width;
  final int height;
  final Uint8List bytes;
  final double? cursorX;
  final double? cursorY;
  final bool cursorVisible;

  const StreamFrame({
    required this.monitorId,
    required this.format,
    required this.width,
    required this.height,
    required this.bytes,
    this.cursorX,
    this.cursorY,
    this.cursorVisible = false,
  });

  factory StreamFrame.fromJson(Map<String, dynamic> json) => StreamFrame(
        monitorId: json['monitorId']?.toString() ?? '',
        format: json['format']?.toString() ?? 'jpeg',
        width: RemoteMonitor._readInt(json['width']) ?? 0,
        height: RemoteMonitor._readInt(json['height']) ?? 0,
        bytes: _readFrameBytes(json['data']),
        cursorX: _readDouble(json['cursorX']),
        cursorY: _readDouble(json['cursorY']),
        cursorVisible: json['cursorVisible'] == true,
      );

  static Uint8List _readFrameBytes(dynamic value) {
    final data = value?.toString() ?? '';
    if (data.isEmpty || data.length > maxBase64Chars) {
      throw const FormatException('Invalid preview frame size');
    }
    return base64Decode(data);
  }

  static double? _readDouble(dynamic value) {
    if (value is double) return value;
    if (value is num) return value.toDouble();
    return double.tryParse(value?.toString() ?? '');
  }
}

class PairingService {
  static const _tcpPreflightTimeout = Duration(seconds: 5);
  static const _socketOpenTimeout = Duration(seconds: 10);
  static const _pairingResponseTimeout = Duration(seconds: 9);

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
    final cleanHostIp = normalizeRemoteLinkHost(hostIp);
    final cleanPairingCode = pairingCode.trim();
    final attemptId = ++_attemptSequence;
    _activeAttemptId = attemptId;
    _pairingComplete = false;
    final uri = Uri.parse('ws://$cleanHostIp:$remoteLinkWsPort');
    final target = uri.toString();
    if (kDebugMode) {
      debugPrint(
        '[RemoteLink] connecting to $target via ${remoteLinkWebSocketBackend()}',
      );
    }
    _emitDiagnostic(
      attemptId,
      'Target $target (${remoteLinkWebSocketBackend()})',
    );
    var connectionStage = 'tcp';
    try {
      _emitDiagnostic(
          attemptId, 'Connection check started ${uri.host}:${uri.port}');
      await preflightRemoteLinkTcp(uri, _tcpPreflightTimeout);
      if (!_isCurrentAttempt(attemptId)) return;
      _emitDiagnostic(
          attemptId, 'Connection check succeeded ${uri.host}:${uri.port}');

      connectionStage = 'websocket';
      _channel = connectRemoteLinkWebSocket(uri);
      _subscription = _channel!.stream.listen(
        (raw) => _handleMessage(attemptId, raw),
        onError: (error) {
          if (kDebugMode) {
            debugPrint('[RemoteLink] socket error for $target: $error');
          }
          _failAttempt(
            attemptId,
            'Local connection error for $target: ${_socketErrorMessage(error)}',
          );
        },
        onDone: () => _handleSocketDone(attemptId),
      );
      if (kDebugMode) {
        debugPrint(
          '[RemoteLink] waiting for socket open timeout=${_socketOpenTimeout.inSeconds}s',
        );
      }
      _emitDiagnostic(attemptId, 'Opening socket to $target');
      await _channel!.ready.timeout(_socketOpenTimeout);
      if (!_isCurrentAttempt(attemptId)) return;
      if (kDebugMode) {
        debugPrint('[RemoteLink] socket opened $target');
      }
      _emitDiagnostic(attemptId, 'Socket opened');
      _startConnectTimeout(attemptId);
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
      if (kDebugMode) {
        debugPrint(
          '[RemoteLink] pairing_request sent deviceId=${_redactDeviceId(deviceId)} codeLength=${cleanPairingCode.length} appVersion=$remoteLinkProtocolVersion',
        );
      }
      _emitDiagnostic(
        attemptId,
        'Pairing request sent to $target',
      );
    } catch (error) {
      if (kDebugMode) {
        debugPrint('[RemoteLink] connection failed for $target: $error');
      }
      final message = _connectionFailureMessage(error, target, connectionStage);
      _failAttempt(attemptId, message);
    }
  }

  bool sendCommandLog(String command, Map<String, dynamic> details) {
    if (command == 'left_click' && _readNumber(details['clicks']) >= 2) {
      final payload = _translateLegacyCommand(command, const {});
      if (payload == null) return false;
      if (!sendInputCommand(payload)) return false;
      return sendInputCommand(payload);
    }
    final payload = _translateLegacyCommand(command, details);
    if (payload == null) return false;
    return sendInputCommand(payload);
  }

  bool sendInputCommand(Map<String, dynamic> command) {
    if (_channel == null || _sessionId == null) return false;
    if (kDebugMode && remoteLinkDebugInput) {
      debugPrint(
          "[RemoteLink][input] mobile send kind=${command['kind']} at=${DateTime.now().toUtc().toIso8601String()}");
    }
    _send(remoteLinkMessage(
      type: MessageTypes.inputCommand,
      deviceId: deviceId,
      sessionId: _sessionId,
      payload: command,
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

  bool startStream(String? monitorId) {
    if (_channel == null || _sessionId == null) return false;
    if (kDebugMode) {
      debugPrint(
          '[RemoteLink] Sending start_stream ${monitorId ?? "(default)"}');
    }
    _send(remoteLinkMessage(
      type: MessageTypes.startStream,
      deviceId: deviceId,
      sessionId: _sessionId,
      payload: {
        if (monitorId != null && monitorId.isNotEmpty) 'monitorId': monitorId,
      },
    ));
    return true;
  }

  bool stopStream() {
    if (_channel == null || _sessionId == null) return false;
    if (kDebugMode) {
      debugPrint('[RemoteLink] Sending stop_stream');
    }
    _send(remoteLinkMessage(
      type: MessageTypes.stopStream,
      deviceId: deviceId,
      sessionId: _sessionId,
    ));
    return true;
  }

  bool sendMobileScreenStart({int? width, int? height, String? message}) {
    if (_channel == null || _sessionId == null) return false;
    _send(remoteLinkMessage(
      type: MessageTypes.mobileScreenStart,
      deviceId: deviceId,
      sessionId: _sessionId,
      payload: {
        'status': 'starting',
        if (message != null) 'message': message,
        if (width != null) 'width': width,
        if (height != null) 'height': height,
      },
    ));
    return true;
  }

  bool sendMobileScreenStatus(String status,
      {String? message,
      int? width,
      int? height,
      int? fps,
      String? lastFrameAt}) {
    if (_channel == null || _sessionId == null) return false;
    _send(remoteLinkMessage(
      type: MessageTypes.mobileScreenStatus,
      deviceId: deviceId,
      sessionId: _sessionId,
      payload: {
        'status': status,
        if (message != null) 'message': message,
        if (width != null) 'width': width,
        if (height != null) 'height': height,
        if (fps != null) 'fps': fps,
        if (lastFrameAt != null) 'lastFrameAt': lastFrameAt,
      },
    ));
    return true;
  }

  bool sendMobileScreenFrame(MobileScreenShareFrame frame) {
    if (_channel == null || _sessionId == null) return false;
    _send(remoteLinkMessage(
      type: MessageTypes.mobileScreenFrame,
      deviceId: deviceId,
      sessionId: _sessionId,
      payload: {
        'format': frame.format,
        'width': frame.width,
        'height': frame.height,
        'data': base64Encode(frame.bytes),
        'timestamp': frame.timestamp.toUtc().toIso8601String(),
      },
    ));
    return true;
  }

  bool sendMobileScreenStop({String? message}) {
    if (_channel == null || _sessionId == null) return false;
    _send(remoteLinkMessage(
      type: MessageTypes.mobileScreenStop,
      deviceId: deviceId,
      sessionId: _sessionId,
      payload: {
        if (message != null) 'message': message,
      },
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
    final dynamic decoded;
    try {
      decoded = jsonDecode(raw.toString());
    } catch (_) {
      _emitIfCurrent(
          attemptId,
          const PairingEvent(
            MessageTypes.error,
            message: 'Desktop sent an invalid protocol message',
          ));
      return;
    }
    if (decoded is! Map<String, dynamic>) return;
    final type = decoded['type']?.toString();
    final payload = decoded['payload'] is Map<String, dynamic>
        ? decoded['payload'] as Map<String, dynamic>
        : <String, dynamic>{};
    if (kDebugMode) {
      debugPrint('[RemoteLink] received message type=${type ?? "(missing)"}');
    }
    _emitDiagnostic(attemptId, 'Response received: ${type ?? "(missing)"}');

    switch (type) {
      case MessageTypes.pairingPending:
        if (kDebugMode) {
          debugPrint('[RemoteLink] pairing_request pending desktop approval');
        }
        _clearConnectTimeout('pairing_pending');
        _emitIfCurrent(
            attemptId,
            const PairingEvent(
              MessageTypes.pairingPending,
              message: 'Waiting for PC approval',
            ));
        break;
      case MessageTypes.pairingApproved:
        if (kDebugMode) {
          debugPrint('[RemoteLink] pairing approved');
        }
        _clearConnectTimeout('pairing_approved');
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
      case MessageTypes.streamStatus:
        _emitIfCurrent(
            attemptId,
            PairingEvent(
              MessageTypes.streamStatus,
              message: payload['message']?.toString(),
              streamStatus: payload['status']?.toString(),
              selectedMonitorId: payload['monitorId']?.toString(),
            ));
        break;
      case MessageTypes.screenFrame:
        try {
          final frame = StreamFrame.fromJson(payload);
          if (frame.monitorId.isNotEmpty && frame.bytes.isNotEmpty) {
            if (kDebugMode) {
              debugPrint(
                '[RemoteLink] screen_frame received ${frame.monitorId} ${frame.width}x${frame.height}',
              );
            }
            _emitIfCurrent(
                attemptId,
                PairingEvent(
                  MessageTypes.screenFrame,
                  frame: frame,
                  selectedMonitorId: frame.monitorId,
                ));
          }
        } catch (_) {
          _emitIfCurrent(
              attemptId,
              const PairingEvent(
                MessageTypes.streamStatus,
                streamStatus: 'error',
                message: 'Received an invalid preview frame',
              ));
        }
        break;
      case MessageTypes.mobileScreenStarted:
        _emitIfCurrent(
            attemptId,
            PairingEvent(
              MessageTypes.mobileScreenStarted,
              message: payload['message']?.toString(),
              mobileScreenStatus: payload['status']?.toString() ?? 'starting',
              mobileScreenWidth: RemoteMonitor._readInt(payload['width']),
              mobileScreenHeight: RemoteMonitor._readInt(payload['height']),
            ));
        break;
      case MessageTypes.mobileScreenStatus:
        _emitIfCurrent(
            attemptId,
            PairingEvent(
              MessageTypes.mobileScreenStatus,
              message: payload['message']?.toString(),
              mobileScreenStatus: payload['status']?.toString(),
              mobileScreenWidth: RemoteMonitor._readInt(payload['width']),
              mobileScreenHeight: RemoteMonitor._readInt(payload['height']),
              mobileScreenFps: RemoteMonitor._readInt(payload['fps']),
              mobileScreenLastFrameAt: payload['lastFrameAt']?.toString(),
            ));
        break;
      case MessageTypes.mobileScreenStop:
        _emitIfCurrent(
            attemptId,
            PairingEvent(
              MessageTypes.mobileScreenStop,
              message: payload['message']?.toString() ??
                  payload['reason']?.toString() ??
                  'Stopped from desktop',
              mobileScreenStatus: payload['status']?.toString(),
            ));
        break;
      case MessageTypes.pairingDenied:
        if (kDebugMode) {
          debugPrint(
              '[RemoteLink] pairing rejected: ${payload['reason'] ?? 'unknown'}');
        }
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
        if (kDebugMode) {
          debugPrint(
              '[RemoteLink] desktop error: ${payload['reason'] ?? 'unknown'}');
        }
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
      frame: event.frame,
      streamStatus: event.streamStatus,
      attemptId: attemptId,
      mobileScreenStatus: event.mobileScreenStatus,
      mobileScreenWidth: event.mobileScreenWidth,
      mobileScreenHeight: event.mobileScreenHeight,
      mobileScreenFps: event.mobileScreenFps,
      mobileScreenLastFrameAt: event.mobileScreenLastFrameAt,
    ));
  }

  void _failAttempt(int attemptId, String message) {
    _emitDiagnostic(attemptId, message);
    _emitIfCurrent(
        attemptId, PairingEvent(MessageTypes.error, message: message));
    _closeAttempt(attemptId);
  }

  void _handleSocketDone(int attemptId) {
    if (!_isCurrentAttempt(attemptId)) return;
    final code = _channel?.closeCode;
    final reason = _channel?.closeReason;
    final message = _pairingComplete
        ? 'Connection closed by desktop'
        : 'Connection closed before pairing completed';
    if (kDebugMode) {
      debugPrint(
        '[RemoteLink] socket close code=${code ?? "(none)"} reason=${reason ?? "(none)"}: $message',
      );
    }
    _emitIfCurrent(
        attemptId, PairingEvent(MessageTypes.disconnect, message: message));
    _closeAttempt(attemptId);
  }

  void _closeAttempt(int attemptId) {
    if (!_isCurrentAttempt(attemptId)) return;
    _activeAttemptId = null;
    _pairingComplete = false;
    _clearConnectTimeout('attempt closed');
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

  void _emitDiagnostic(int attemptId, String message) {
    _emitIfCurrent(
      attemptId,
      PairingEvent(pairingDiagnosticEvent, message: message),
    );
  }

  void _startConnectTimeout(int attemptId) {
    _clearConnectTimeout('restart');
    if (kDebugMode) {
      debugPrint('[RemoteLink] timeout started for pairing response');
    }
    _connectTimeout = Timer(_pairingResponseTimeout, () {
      if (kDebugMode) {
        debugPrint('[RemoteLink] timeout fired for pairing response');
      }
      _failAttempt(attemptId, 'Pairing request timed out');
    });
  }

  void _clearConnectTimeout(String reason) {
    if (_connectTimeout == null) return;
    _connectTimeout?.cancel();
    _connectTimeout = null;
    if (kDebugMode) {
      debugPrint('[RemoteLink] timeout cleared: $reason');
    }
  }

  String _redactDeviceId(String value) {
    if (value.length <= 8) return '***';
    return '${value.substring(0, 4)}...${value.substring(value.length - 4)}';
  }

  String _socketErrorMessage(Object error) {
    final text = error.toString().replaceAll(RegExp(r'\s+'), ' ').trim();
    return text.isEmpty ? error.runtimeType.toString() : text;
  }

  String _connectionFailureMessage(
    Object error,
    String target,
    String connectionStage,
  ) {
    if (error is TimeoutException) {
      if (connectionStage == 'tcp') {
        return 'Connection check timed out after ${_tcpPreflightTimeout.inSeconds}s for $target';
      }
      return 'Local connection timed out after ${_socketOpenTimeout.inSeconds}s for $target';
    }
    final message = _socketErrorMessage(error);
    if (message.toLowerCase().contains('socketexception') ||
        message.contains('OS Error') ||
        message.contains('Network is unreachable') ||
        message.contains('Connection refused') ||
        message.contains('Connection timed out') ||
        message.contains('No route to host')) {
      return 'Connection check failed for $target: $message';
    }
    return 'Local connection failed for $target: $message';
  }

  Map<String, dynamic>? _translateLegacyCommand(
      String command, Map<String, dynamic> details) {
    switch (command) {
      case 'touchpad_move':
        return {
          'kind': 'mouse_move',
          'dx': _readNumber(details['dx']),
          'dy': _readNumber(details['dy']),
        };
      case 'left_click':
        return {'kind': 'mouse_click', 'button': 'left'};
      case 'right_click':
        return {'kind': 'mouse_click', 'button': 'right'};
      case 'left_button_down':
        return {'kind': 'mouse_down', 'button': 'left'};
      case 'left_button_up':
        return {'kind': 'mouse_up', 'button': 'left'};
      case 'scroll_up':
        return {'kind': 'mouse_scroll', 'delta': 120};
      case 'scroll_down':
        return {'kind': 'mouse_scroll', 'delta': -120};
      case 'text':
        final text = details['text']?.toString() ?? '';
        if (text.isEmpty || text.length > 512) return null;
        return {
          'kind': 'type_text',
          'text': text,
        };
      case 'shortcut':
        final keys = _parseShortcut(details['shortcut']?.toString());
        if (keys.isEmpty) return null;
        return {
          'kind': 'shortcut',
          'keys': keys,
        };
      case 'release_all_keys':
        return {'kind': 'release_all_modifiers'};
      case 'key':
        return _translateKeyCommand(details);
      default:
        return null;
    }
  }

  Map<String, dynamic>? _translateKeyCommand(Map<String, dynamic> details) {
    final key = details['key']?.toString() ?? '';
    final state = details['state']?.toString() ?? '';
    final normalized = _normalizeKeyLabel(key);
    if (normalized.isEmpty) return null;

    if (const {'ctrl', 'alt', 'shift', 'win'}.contains(normalized)) {
      return {
        'kind': state == 'released' ? 'modifier_up' : 'modifier_down',
        'key': normalized,
      };
    }

    if (normalized.startsWith('f') &&
        int.tryParse(normalized.substring(1)) != null) {
      return {'kind': 'function_key', 'key': normalized};
    }

    return {
      'kind': 'key_press',
      'key': normalized,
    };
  }

  List<String> _parseShortcut(String? shortcut) {
    if (shortcut == null || shortcut.isEmpty) return const [];
    return shortcut
        .split('+')
        .map((part) => _normalizeKeyLabel(part))
        .where((part) => part.isNotEmpty)
        .toList(growable: false);
  }

  double _readNumber(dynamic value) {
    if (value is num) return value.toDouble();
    return double.tryParse(value?.toString() ?? '') ?? 0;
  }

  String _normalizeKeyLabel(String value) {
    final normalized = value.trim().toLowerCase();
    switch (normalized) {
      case 'esc':
        return 'escape';
      case 'del':
        return 'delete';
      case 'back':
      case 'backspace':
        return 'backspace';
      case 'ctrl':
      case 'control':
        return 'ctrl';
      case 'alt':
        return 'alt';
      case 'shift':
        return 'shift';
      case 'win':
      case 'super':
      case 'meta':
        return 'win';
      default:
        return normalized;
    }
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

String normalizeRemoteLinkHost(String value) {
  var host = value
      .replaceAll(RegExp(r'[\u0000-\u001F\u007F\u200B-\u200D\uFEFF]'), '')
      .trim();
  if (host.isEmpty) return '';

  final hasScheme = RegExp(r'^[a-zA-Z][a-zA-Z0-9+.-]*://').hasMatch(host);
  final uri = Uri.tryParse(hasScheme ? host : 'ws://$host');
  if (uri != null && uri.host.isNotEmpty) {
    host = uri.host;
  } else {
    host = host.split('/').first.split('?').first.split('#').first;
    final colonIndex = host.indexOf(':');
    if (colonIndex >= 0) host = host.substring(0, colonIndex);
  }

  return host.trim();
}
