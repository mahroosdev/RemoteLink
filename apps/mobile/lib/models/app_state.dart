import 'dart:async';

import 'package:flutter/material.dart';
import '../services/pairing_service.dart';
import '../services/protocol.dart';

enum ConnectionStatus { disconnected, connecting, waitingApproval, connected, denied, failed }

class LogItem {
  final String event;
  final String timestamp;
  LogItem(this.event, this.timestamp);
}

/// Notification contract (keeps taps flash-free):
/// - Settings live in individual ValueNotifiers; each settings row listens to
///   exactly one of them.
/// - The activity ticker is its own [lastAction] ValueNotifier; `addLog` never
///   calls `notifyListeners()`, so an ordinary tap rebuilds only the ticker.
/// - `notifyListeners()` fires only for render-relevant interaction state:
///   connection status, monitors, held modifiers, function-keys expansion.
class AppState extends ChangeNotifier {
  AppState() {
    _pairingSubscription = _pairingService.events.listen(_handlePairingEvent);
  }

  // Connection State
  ConnectionStatus _status = ConnectionStatus.disconnected;
  String _hostIp = '';
  String _pairingCode = '';
  String? _sessionId;
  String? _lastConnectionError;
  int _activeMonitor = 1;

  /// Monitors reported by the PC after approval.
  List<RemoteMonitor> _detectedMonitors = const [];
  final PairingService _pairingService = PairingService();
  late final StreamSubscription<PairingEvent> _pairingSubscription;
  Completer<void>? _pendingConnect;

  // Settings State (granular notifiers)
  final ValueNotifier<bool> autoReconnect = ValueNotifier(true);
  final ValueNotifier<bool> lowLatencyMode = ValueNotifier(true);
  final ValueNotifier<double> mouseSensitivity = ValueNotifier(50.0);
  final ValueNotifier<double> scrollVelocity = ValueNotifier(40.0);
  final ValueNotifier<String> touchpadMode = ValueNotifier('Relative Trackpad');
  final ValueNotifier<String> streamResolution = ValueNotifier('1080p');
  final ValueNotifier<String> frameRate = ValueNotifier('60 FPS');
  final ValueNotifier<String> themeMode = ValueNotifier('Professional Dark');
  final ValueNotifier<bool> requirePcApproval = ValueNotifier(true);
  final ValueNotifier<bool> showTouchpadPointer = ValueNotifier(true);

  // Layout / preview modes (manual, never driven by device orientation)
  final ValueNotifier<String> remoteLayoutMode = ValueNotifier('portrait');
  final ValueNotifier<String> fullscreenPreviewOrientation = ValueNotifier('landscape');
  bool _isPreviewFullscreen = false;

  // Interaction State
  final Set<String> _heldModifiers = {};
  final List<LogItem> _activityLog = [];
  bool _showFunctionKeys = false;

  /// Last-action ticker. Separate notifier so control taps rebuild only the
  /// small ticker text, never a screen.
  final ValueNotifier<String> lastAction = ValueNotifier('Ready');

  // Getters
  ConnectionStatus get status => _status;
  bool get isConnected => _status == ConnectionStatus.connected;
  String get hostIp => _hostIp;
  String get pairingCode => _pairingCode;
  String? get sessionId => _sessionId;
  String? get lastConnectionError => _lastConnectionError;
  int get activeMonitor => _activeMonitor;
  int get detectedMonitorCount => _detectedMonitors.length;
  List<RemoteMonitor> get detectedMonitors => _detectedMonitors;
  Set<String> get heldModifiers => _heldModifiers;
  List<LogItem> get activityLog => _activityLog;
  bool get showFunctionKeys => _showFunctionKeys;
  bool get isPreviewFullscreen => _isPreviewFullscreen;

  @override
  void dispose() {
    _pairingSubscription.cancel();
    unawaited(_pairingService.dispose());
    autoReconnect.dispose();
    lowLatencyMode.dispose();
    mouseSensitivity.dispose();
    scrollVelocity.dispose();
    touchpadMode.dispose();
    streamResolution.dispose();
    frameRate.dispose();
    themeMode.dispose();
    requirePcApproval.dispose();
    showTouchpadPointer.dispose();
    remoteLayoutMode.dispose();
    fullscreenPreviewOrientation.dispose();
    lastAction.dispose();
    super.dispose();
  }

  // Actions
  /// [updateTicker]: false keeps the event in the activity log but out of the
  /// Remote screen's last-action ticker (e.g. theme changes are settings-only).
  void addLog(String event, {bool updateTicker = true}) {
    final now = DateTime.now();
    final timestamp = "${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}:${now.second.toString().padLeft(2, '0')}";
    _activityLog.insert(0, LogItem(event, timestamp));
    if (_activityLog.length > 50) _activityLog.removeLast();
    if (updateTicker) lastAction.value = event;
    // Intentionally no notifyListeners(): ticker consumers listen to
    // [lastAction]; methods that change rendered state notify explicitly.
  }

  // Live feedback (e.g. touchpad drags) without flooding the activity log.
  void setTransientAction(String message) {
    lastAction.value = message;
  }

  void setHostIp(String ip) {
    _hostIp = ip; // silent store; nothing renders it until connect
  }

  void setPairingCode(String code) {
    _pairingCode = code; // silent store
  }

  Future<void> connect(String ip, String code) async {
    _hostIp = ip;
    _pairingCode = code;
    _status = ConnectionStatus.connecting;
    _lastConnectionError = null;
    _sessionId = null;
    _detectedMonitors = const [];
    _activeMonitor = 1;
    notifyListeners();

    if (_pendingConnect != null && !_pendingConnect!.isCompleted) {
      _pendingConnect!.complete();
    }
    _pendingConnect = Completer<void>();
    await _pairingService.connect(ip, code);
    return _pendingConnect!.future;
  }

  void disconnect() {
    unawaited(_pairingService.disconnect());
    _status = ConnectionStatus.disconnected;
    _heldModifiers.clear();
    _detectedMonitors = const [];
    _sessionId = null;
    _activeMonitor = 1;
    addLog("Disconnected from host");
    notifyListeners();
  }

  void setActiveMonitor(int id) {
    if (id < 1 || id > detectedMonitorCount) return;
    _activeMonitor = id;
    addLog("Switched to Screen $id");
    sendCommandLog('monitor_switch', {'screenIndex': id, 'monitorId': _detectedMonitors[id - 1].id});
    notifyListeners();
  }

  /// Dev-only simulation of how many monitors the PC reports (1..3).
  void setDetectedMonitorCount(int count) {
    final simulatedCount = count.clamp(1, 3);
    _detectedMonitors = [
      for (var i = 1; i <= simulatedCount; i++)
        RemoteMonitor(id: 'demo-screen-$i', label: 'Screen $i', primary: i == 1),
    ];
    if (_activeMonitor > detectedMonitorCount) _activeMonitor = 1;
    addLog("Simulated $detectedMonitorCount detected screen(s)");
    notifyListeners();
  }

  // Manual Remote layout: portrait <-> landscape controls.
  void toggleRemoteLayout() {
    remoteLayoutMode.value = remoteLayoutMode.value == 'portrait' ? 'landscape' : 'portrait';
    addLog('Remote layout switched to ${remoteLayoutMode.value}');
  }

  void setPreviewFullscreen(bool value) {
    if (_isPreviewFullscreen == value) return;
    _isPreviewFullscreen = value;
    addLog(value ? 'Opened fullscreen preview' : 'Closed fullscreen preview');
    notifyListeners();
  }

  // Rotates only the fullscreen preview view, never the whole app.
  void toggleFullscreenOrientation() {
    fullscreenPreviewOrientation.value =
        fullscreenPreviewOrientation.value == 'landscape' ? 'portrait' : 'landscape';
    addLog('Fullscreen preview rotated to ${fullscreenPreviewOrientation.value}');
  }

  // Setters for Settings. addLog feeds the activity log + ticker only; the
  // Settings rows listen to their individual ValueNotifiers.
  void setAutoReconnect(bool val) { autoReconnect.value = val; addLog("Auto Reconnect: ${val ? 'on' : 'off'}"); }
  void setLowLatencyMode(bool val) { lowLatencyMode.value = val; addLog("Low Latency Mode: ${val ? 'on' : 'off'}"); }
  void setMouseSensitivity(double val) { mouseSensitivity.value = val; }
  void setScrollVelocity(double val) { scrollVelocity.value = val; }
  void setTouchpadMode(String val) { touchpadMode.value = val; addLog("Touchpad Mode: $val"); }
  void setStreamResolution(String val) { streamResolution.value = val; addLog("Stream Resolution: $val"); }
  void setFrameRate(String val) { frameRate.value = val; addLog("Frame Rate: $val"); }
  void setThemeMode(String val) { themeMode.value = val; addLog("Theme: $val", updateTicker: false); }
  void setRequirePcApproval(bool val) { requirePcApproval.value = val; addLog("PC Approval required: ${val ? 'on' : 'off'}"); }
  void setShowTouchpadPointer(bool val) { showTouchpadPointer.value = val; addLog("Touchpad Pointer: ${val ? 'on' : 'off'}", updateTicker: false); }

  void clearTrustedDevices() {
    addLog("Cleared all trusted device signatures");
  }

  void toggleModifier(String key) {
    if (_heldModifiers.contains(key)) {
      _heldModifiers.remove(key);
      addLog("Released $key");
      sendCommandLog('key', {'key': key, 'state': 'released'});
    } else {
      _heldModifiers.add(key);
      addLog("Held $key");
      sendCommandLog('key', {'key': key, 'state': 'held'});
    }
    notifyListeners();
  }

  void releaseAllKeys() {
    _heldModifiers.clear();
    addLog("All virtual keys released");
    sendCommandLog('release_all_keys', {});
    notifyListeners();
  }

  void toggleFunctionKeys() {
    _showFunctionKeys = !_showFunctionKeys;
    notifyListeners();
  }

  void clearLog() {
    _activityLog.clear();
    notifyListeners();
  }

  void sendCommandLog(String command, Map<String, dynamic> details) {
    if (!isConnected) {
      setTransientAction('Connect before sending $command');
      return;
    }
    _pairingService.sendCommandLog(command, details);
  }

  void _handlePairingEvent(PairingEvent event) {
    switch (event.type) {
      case MessageTypes.pairingPending:
        _status = ConnectionStatus.waitingApproval;
        addLog('Waiting for PC approval');
        notifyListeners();
        break;
      case MessageTypes.pairingApproved:
        _status = ConnectionStatus.connected;
        _sessionId = event.sessionId;
        _detectedMonitors = event.monitors;
        _activeMonitor = 1;
        addLog("Connected to PC locally ($_hostIp)");
        addLog("Detected $detectedMonitorCount screen(s)");
        _completePendingConnect();
        notifyListeners();
        break;
      case MessageTypes.monitorList:
        _detectedMonitors = event.monitors;
        if (_activeMonitor > detectedMonitorCount) _activeMonitor = 1;
        addLog("Updated monitor list: $detectedMonitorCount screen(s)");
        notifyListeners();
        break;
      case MessageTypes.pairingDenied:
        _status = ConnectionStatus.denied;
        _lastConnectionError = event.message ?? 'Pairing denied by desktop';
        _detectedMonitors = const [];
        unawaited(_pairingService.disconnect(sendMessage: false));
        addLog(_lastConnectionError!);
        _completePendingConnect();
        notifyListeners();
        break;
      case MessageTypes.disconnect:
        _status = ConnectionStatus.disconnected;
        _sessionId = null;
        _detectedMonitors = const [];
        _heldModifiers.clear();
        addLog(event.message ?? 'Connection closed by desktop');
        _completePendingConnect();
        notifyListeners();
        break;
      case MessageTypes.error:
        _status = ConnectionStatus.failed;
        _lastConnectionError = event.message ??
            'Connection failed. Start desktop app, turn engine ON, check Host IP, same Wi-Fi, and firewall.';
        _detectedMonitors = const [];
        unawaited(_pairingService.disconnect(sendMessage: false));
        addLog(_lastConnectionError!);
        _completePendingConnect();
        notifyListeners();
        break;
    }
  }

  void _completePendingConnect() {
    if (_pendingConnect != null && !_pendingConnect!.isCompleted) {
      _pendingConnect!.complete();
    }
  }
}
