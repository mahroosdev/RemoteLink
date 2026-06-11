import 'package:flutter/material.dart';

enum ConnectionStatus { disconnected, connecting, connected }

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
  // Connection State
  ConnectionStatus _status = ConnectionStatus.disconnected;
  String _hostIp = '';
  String _pairingCode = '';
  int _activeMonitor = 1;

  /// Monitors reported by the PC. 0 while disconnected; mock value after the
  /// local connect succeeds (dynamic so real pairing can report 1..3+ later).
  int _detectedMonitorCount = 0;

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
  int get activeMonitor => _activeMonitor;
  int get detectedMonitorCount => _detectedMonitorCount;
  Set<String> get heldModifiers => _heldModifiers;
  List<LogItem> get activityLog => _activityLog;
  bool get showFunctionKeys => _showFunctionKeys;
  bool get isPreviewFullscreen => _isPreviewFullscreen;

  @override
  void dispose() {
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
    notifyListeners();

    // Mock connection delay
    await Future.delayed(const Duration(milliseconds: 800));

    // A disconnect while "connecting" must not be overwritten.
    if (_status != ConnectionStatus.connecting) return;
    _status = ConnectionStatus.connected;
    // Mock detection until pairing reports the real monitor list.
    _detectedMonitorCount = 2;
    _activeMonitor = 1;
    addLog("Connected to PC locally ($ip)");
    addLog("Detected $_detectedMonitorCount screen(s)");
    notifyListeners();
  }

  void disconnect() {
    _status = ConnectionStatus.disconnected;
    _heldModifiers.clear();
    _detectedMonitorCount = 0;
    _activeMonitor = 1;
    addLog("Disconnected from host");
    notifyListeners();
  }

  void setActiveMonitor(int id) {
    if (id < 1 || id > _detectedMonitorCount) return;
    _activeMonitor = id;
    addLog("Switched to Screen $id");
    notifyListeners();
  }

  /// Dev-only simulation of how many monitors the PC reports (1..3).
  void setDetectedMonitorCount(int count) {
    _detectedMonitorCount = count.clamp(1, 3);
    if (_activeMonitor > _detectedMonitorCount) _activeMonitor = 1;
    addLog("Simulated $_detectedMonitorCount detected screen(s)");
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
    } else {
      _heldModifiers.add(key);
      addLog("Held $key");
    }
    notifyListeners();
  }

  void releaseAllKeys() {
    _heldModifiers.clear();
    addLog("All virtual keys released");
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
}
