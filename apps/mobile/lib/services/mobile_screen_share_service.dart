import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

enum MobileScreenShareStatus {
  off,
  stopped,
  starting,
  sharing,
  stopping,
  error
}

class MobileScreenShareFrame {
  final int width;
  final int height;
  final String format;
  final Uint8List bytes;
  final DateTime timestamp;

  const MobileScreenShareFrame({
    required this.width,
    required this.height,
    required this.format,
    required this.bytes,
    required this.timestamp,
  });

  factory MobileScreenShareFrame.fromJson(Map<dynamic, dynamic> json) {
    final data = json['data']?.toString() ?? '';
    return MobileScreenShareFrame(
      width: _readInt(json['width']) ?? 0,
      height: _readInt(json['height']) ?? 0,
      format: json['format']?.toString() ?? 'jpeg',
      bytes: base64Decode(data),
      timestamp: _readTimestamp(json['timestamp']),
    );
  }

  static int? _readInt(dynamic value) {
    if (value is int) return value;
    if (value is num) return value.round();
    return int.tryParse(value?.toString() ?? '');
  }

  static DateTime _readTimestamp(dynamic value) {
    if (value is int) {
      return DateTime.fromMillisecondsSinceEpoch(value, isUtc: true);
    }
    if (value is num) {
      return DateTime.fromMillisecondsSinceEpoch(value.round(), isUtc: true);
    }
    final text = value?.toString() ?? '';
    final epochMillis = int.tryParse(text);
    if (epochMillis != null) {
      return DateTime.fromMillisecondsSinceEpoch(epochMillis, isUtc: true);
    }
    return DateTime.tryParse(text)?.toUtc() ?? DateTime.now().toUtc();
  }
}

class MobileScreenShareEvent {
  final String type;
  final MobileScreenShareStatus? status;
  final String? message;
  final MobileScreenShareFrame? frame;
  final int? width;
  final int? height;
  final int? fps;
  final String? lastFrameAt;
  final int? requestId;

  const MobileScreenShareEvent({
    required this.type,
    this.status,
    this.message,
    this.frame,
    this.width,
    this.height,
    this.fps,
    this.lastFrameAt,
    this.requestId,
  });
}

class MobileScreenShareService {
  static const _methodChannel = MethodChannel('remotelink/mobile_screen_share');
  static const _eventChannel =
      EventChannel('remotelink/mobile_screen_share_events');

  final _events = StreamController<MobileScreenShareEvent>.broadcast();
  StreamSubscription? _subscription;

  Stream<MobileScreenShareEvent> get events => _events.stream;
  bool get isSupported =>
      !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  Future<bool> startShare({
    required int requestId,
    int maxWidth = 540,
    int maxHeight = 960,
    int fps = 6,
    int jpegQuality = 62,
  }) async {
    if (!isSupported) {
      if (kDebugMode) {
        debugPrint(
            '[RemoteLink] Mobile screen sharing unsupported on this platform');
      }
      return false;
    }
    _ensureSubscription();
    if (kDebugMode) {
      debugPrint('[RemoteLink] Requesting mobile screen share');
    }
    try {
      final result = await _methodChannel.invokeMapMethod<String, dynamic>(
        'startShare',
        {
          'requestId': requestId,
          'maxWidth': maxWidth,
          'maxHeight': maxHeight,
          'fps': fps,
          'jpegQuality': jpegQuality,
        },
      );
      if (kDebugMode) {
        debugPrint(
            '[RemoteLink] Android consent request accepted=${result?['accepted'] == true}');
      }
      return result?['accepted'] == true;
    } on MissingPluginException {
      if (kDebugMode) {
        debugPrint('[RemoteLink] Mobile screen share native plugin missing');
      }
      return false;
    } catch (error) {
      if (kDebugMode) {
        debugPrint('[RemoteLink] Mobile screen share start failed: $error');
      }
      return false;
    }
  }

  Future<bool> stopShare({int? requestId}) async {
    if (!isSupported) {
      return true;
    }
    if (kDebugMode) {
      debugPrint('[RemoteLink] Requesting stop mobile screen share');
    }
    try {
      final result =
          await _methodChannel.invokeMapMethod<String, dynamic>('stopShare', {
        if (requestId != null) 'requestId': requestId,
      }).timeout(const Duration(seconds: 3));
      if (kDebugMode) {
        debugPrint(
            '[RemoteLink] Mobile screen share stop ok=${result?['ok'] == true}');
      }
      return result?['ok'] == true;
    } on MissingPluginException {
      return true;
    } on TimeoutException {
      if (kDebugMode) {
        debugPrint('[RemoteLink] Mobile screen share native stop timed out');
      }
      return false;
    } catch (error) {
      if (kDebugMode) {
        debugPrint('[RemoteLink] Mobile screen share stop failed: $error');
      }
      return false;
    }
  }

  Future<void> dispose() async {
    await stopShare();
    await _subscription?.cancel();
    await _events.close();
  }

  void _ensureSubscription() {
    if (_subscription != null) return;
    _subscription = _eventChannel.receiveBroadcastStream().listen(
      _handleEvent,
      onError: (error) {
        _emit(MobileScreenShareEvent(
          type: 'status',
          status: MobileScreenShareStatus.error,
          message: error.toString(),
        ));
      },
    );
  }

  void _handleEvent(dynamic raw) {
    if (raw is! Map) return;
    final json = raw.cast<dynamic, dynamic>();
    final type = json['type']?.toString();
    switch (type) {
      case 'status':
        if (kDebugMode) {
          debugPrint(
              '[RemoteLink] Native mobile share status: ${json['status']} ${json['message'] ?? ''}');
        }
        _emit(MobileScreenShareEvent(
          type: 'status',
          status: _parseStatus(json['status']?.toString()),
          message: json['message']?.toString(),
          width: MobileScreenShareFrame._readInt(json['width']),
          height: MobileScreenShareFrame._readInt(json['height']),
          fps: MobileScreenShareFrame._readInt(json['fps']),
          lastFrameAt: json['lastFrameAt']?.toString(),
          requestId: MobileScreenShareFrame._readInt(json['requestId']),
        ));
        break;
      case 'frame':
        try {
          final frame = MobileScreenShareFrame.fromJson(json);
          if (frame.bytes.isNotEmpty && frame.width > 0 && frame.height > 0) {
            if (kDebugMode) {
              debugPrint(
                  '[RemoteLink] Native mobile frame received ${frame.width}x${frame.height}');
            }
            _emit(MobileScreenShareEvent(
              type: 'frame',
              frame: frame,
              requestId: MobileScreenShareFrame._readInt(json['requestId']),
            ));
          }
        } catch (error) {
          _emit(MobileScreenShareEvent(
            type: 'status',
            status: MobileScreenShareStatus.error,
            message: 'Invalid mobile screen frame: $error',
          ));
        }
        break;
      default:
        break;
    }
  }

  MobileScreenShareStatus _parseStatus(String? value) {
    switch (value) {
      case 'starting':
        return MobileScreenShareStatus.starting;
      case 'sharing':
        return MobileScreenShareStatus.sharing;
      case 'stopping':
        return MobileScreenShareStatus.stopping;
      case 'stopped':
        return MobileScreenShareStatus.stopped;
      case 'error':
        return MobileScreenShareStatus.error;
      case 'off':
      default:
        return MobileScreenShareStatus.off;
    }
  }

  void _emit(MobileScreenShareEvent event) {
    if (_events.isClosed) return;
    _events.add(event);
  }
}
