import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/pairing_service.dart';
import '../services/mobile_screen_share_service.dart';
import '../services/discovery.dart';
import '../services/protocol.dart';
import '../theme/app_theme.dart';

enum ConnectionStatus {
  disconnected,
  connecting,
  waitingApproval,
  connected,
  denied,
  failed
}

enum PreviewStreamStatus { stopped, starting, active, error }

enum RemoteMode { idle, pcControl, pcPreview, mobileScreenShare }

typedef DesktopDiscoveryScanner = Future<List<DiscoveryResult>> Function();

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
  AppState({
    PairingService? pairingService,
    SharedPreferences? preferences,
    DesktopDiscoveryScanner? discoveryScanner,
  })  : _pairingService = pairingService ?? PairingService(),
        _mobileScreenShareService = MobileScreenShareService(),
        _discoveryScanner =
            discoveryScanner ?? (() => scanForRemoteLinkDesktops()),
        _preferences = preferences {
    if (_preferences != null) {
      _restoreSettings();
    } else {
      _initAsync();
    }
    _pairingSubscription = _pairingService.events.listen(_handlePairingEvent);
    _mobileScreenShareSubscription =
        _mobileScreenShareService.events.listen(_handleMobileScreenShareEvent);
  }

  Future<void> _initAsync() async {
    try {
      _preferences = await SharedPreferences.getInstance();
      _restoreSettings();
      notifyListeners();
    } catch (_) {
      // Failed to load prefs, continue with defaults
    }
  }

  static Future<AppState> create({
    PairingService? pairingService,
    DesktopDiscoveryScanner? discoveryScanner,
  }) async {
    // Kept for tests, but main.dart uses AppState() directly now.
    SharedPreferences? preferences;
    try {
      preferences = await SharedPreferences.getInstance();
    } catch (_) {
      preferences = null;
    }
    return AppState(
      pairingService: pairingService,
      preferences: preferences,
      discoveryScanner: discoveryScanner,
    );
  }

  // Connection State
  ConnectionStatus _status = ConnectionStatus.disconnected;
  String _hostIp = '';
  String _pairingCode = '';
  String? _sessionId;
  String? _lastConnectionError;
  String? _selectedMonitorId;
  PreviewStreamStatus _previewStreamStatus = PreviewStreamStatus.stopped;
  Uint8List? _latestPreviewFrame;
  int? _latestPreviewFrameWidth;
  int? _latestPreviewFrameHeight;
  Offset? _latestPreviewCursor;
  String? _previewStreamError;
  bool _previewStreamRequested = false;

  MobileScreenShareStatus _mobileScreenShareStatus =
      MobileScreenShareStatus.off;
  Uint8List? _latestMobileScreenFrame;
  int? _latestMobileScreenFrameWidth;
  int? _latestMobileScreenFrameHeight;
  DateTime? _latestMobileScreenFrameAt;
  String? _mobileScreenShareError;
  int _mobileFrameSendCount = 0;
  int _mobileScreenShareRequestId = 0;
  bool _mobileScreenShareStopInFlight = false;
  bool _ignoreMobileScreenShareActiveEvents = false;

  /// Monitors reported by the PC after approval.
  List<RemoteMonitor> _detectedMonitors = const [];
  final PairingService _pairingService;
  final MobileScreenShareService _mobileScreenShareService;
  final DesktopDiscoveryScanner _discoveryScanner;
  SharedPreferences? _preferences;
  late final StreamSubscription<PairingEvent> _pairingSubscription;
  late final StreamSubscription<MobileScreenShareEvent>
      _mobileScreenShareSubscription;
  Completer<void>? _pendingConnect;

  static const _autoReconnectKey = 'settings.autoReconnect';
  static const _lowLatencyModeKey = 'settings.lowLatencyMode';
  static const _mouseSensitivityKey = 'settings.mouseSensitivity';
  static const _scrollVelocityKey = 'settings.scrollVelocity';
  static const _touchpadModeKey = 'settings.touchpadMode';
  static const _streamResolutionKey = 'settings.streamResolution';
  static const _frameRateKey = 'settings.frameRate';
  static const _themeModeKey = 'settings.themeMode';
  static const _requirePcApprovalKey = 'settings.requirePcApproval';
  static const _showTouchpadPointerKey = 'settings.showTouchpadPointer';
  static const _pointerSizeKey = 'settings.pointerSize';
  static const _pointerStyleKey = 'settings.pointerStyle';
  static const pointerSizeOptions = ['Micro', 'Tiny', 'Small', 'Medium'];
  static const pointerStyleOptions = [
    'Classic Arrow',
    'Minimal Arrow',
    'Thin Arrow',
    'Dot Cursor',
    'Small Crosshair',
  ];

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
  final ValueNotifier<String> pointerSize = ValueNotifier('Tiny');
  final ValueNotifier<String> pointerStyle = ValueNotifier('Classic Arrow');

  // Fullscreen preview route state.
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
  int get activeMonitor {
    final selectedId = _selectedMonitorId;
    final selectedIndex = selectedId == null
        ? -1
        : _detectedMonitors.indexWhere((monitor) => monitor.id == selectedId);
    return selectedIndex >= 0 ? selectedIndex + 1 : 1;
  }

  String? get selectedMonitorId => _selectedMonitorId;
  PreviewStreamStatus get previewStreamStatus => _previewStreamStatus;
  Uint8List? get latestPreviewFrame => _latestPreviewFrame;
  int? get latestPreviewFrameWidth => _latestPreviewFrameWidth;
  int? get latestPreviewFrameHeight => _latestPreviewFrameHeight;
  Offset? get latestPreviewCursor => _latestPreviewCursor;
  String? get previewStreamError => _previewStreamError;
  bool get isPreviewStreaming =>
      _previewStreamStatus == PreviewStreamStatus.starting ||
      _previewStreamStatus == PreviewStreamStatus.active;
  bool get isMobileScreenShareModeActive =>
      _mobileScreenShareStatus == MobileScreenShareStatus.starting ||
      _mobileScreenShareStatus == MobileScreenShareStatus.sharing ||
      _mobileScreenShareStatus == MobileScreenShareStatus.stopping ||
      _latestMobileScreenFrame != null;
  bool get canStartPreviewStream =>
      isConnected && !isMobileScreenShareModeActive;
  bool get canStartMobileScreenShare => isConnected && !isPreviewStreaming;
  RemoteMode get activeRemoteMode {
    if (isMobileScreenShareModeActive) return RemoteMode.mobileScreenShare;
    if (isPreviewStreaming) return RemoteMode.pcPreview;
    if (isConnected) return RemoteMode.pcControl;
    return RemoteMode.idle;
  }

  String get activeRemoteModeLabel {
    switch (activeRemoteMode) {
      case RemoteMode.mobileScreenShare:
        return 'Phone Screen Share';
      case RemoteMode.pcPreview:
        return 'PC Preview';
      case RemoteMode.pcControl:
        return 'PC Control';
      case RemoteMode.idle:
        return 'Idle';
    }
  }

  bool get isMobileScreenSharing =>
      _mobileScreenShareStatus == MobileScreenShareStatus.sharing ||
      _latestMobileScreenFrameAt != null;
  bool get isMobileScreenShareStarting =>
      _mobileScreenShareStatus == MobileScreenShareStatus.starting;
  bool get isMobileScreenShareStopping =>
      _mobileScreenShareStatus == MobileScreenShareStatus.stopping;
  bool get isMobileScreenShareSupported =>
      _mobileScreenShareService.isSupported;
  MobileScreenShareStatus get mobileScreenShareStatus =>
      _mobileScreenShareStatus;
  Uint8List? get latestMobileScreenFrame => _latestMobileScreenFrame;
  int? get latestMobileScreenFrameWidth => _latestMobileScreenFrameWidth;
  int? get latestMobileScreenFrameHeight => _latestMobileScreenFrameHeight;
  DateTime? get latestMobileScreenFrameAt => _latestMobileScreenFrameAt;
  String? get mobileScreenShareError => _mobileScreenShareError;
  int get detectedMonitorCount => _detectedMonitors.length;
  List<RemoteMonitor> get detectedMonitors => _detectedMonitors;
  Set<String> get heldModifiers => _heldModifiers;
  List<LogItem> get activityLog => _activityLog;
  bool get showFunctionKeys => _showFunctionKeys;
  bool get isPreviewFullscreen => _isPreviewFullscreen;

  @override
  void dispose() {
    _pairingSubscription.cancel();
    _mobileScreenShareSubscription.cancel();
    unawaited(_pairingService.dispose());
    unawaited(_mobileScreenShareService.dispose());
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
    pointerSize.dispose();
    pointerStyle.dispose();
    lastAction.dispose();
    super.dispose();
  }

  // Actions
  void _restoreSettings() {
    final preferences = _preferences;
    if (preferences == null) return;

    autoReconnect.value =
        preferences.getBool(_autoReconnectKey) ?? autoReconnect.value;
    lowLatencyMode.value =
        preferences.getBool(_lowLatencyModeKey) ?? lowLatencyMode.value;
    mouseSensitivity.value =
        preferences.getDouble(_mouseSensitivityKey) ?? mouseSensitivity.value;
    scrollVelocity.value =
        preferences.getDouble(_scrollVelocityKey) ?? scrollVelocity.value;
    touchpadMode.value = _validOption(
      preferences.getString(_touchpadModeKey),
      const ['Relative Trackpad', 'Absolute Touch', 'Gaming Mode'],
      touchpadMode.value,
    );
    streamResolution.value = _validOption(
      preferences.getString(_streamResolutionKey),
      const ['720p', '1080p', '1440p'],
      streamResolution.value,
    );
    frameRate.value = _validOption(
      preferences.getString(_frameRateKey),
      const ['15 FPS', '30 FPS', '60 FPS'],
      frameRate.value,
    );
    themeMode.value = _validOption(
      preferences.getString(_themeModeKey),
      AppTheme.themeModes,
      themeMode.value,
    );
    requirePcApproval.value =
        preferences.getBool(_requirePcApprovalKey) ?? requirePcApproval.value;
    showTouchpadPointer.value = preferences.getBool(_showTouchpadPointerKey) ??
        showTouchpadPointer.value;
    pointerSize.value = _validOption(
      preferences.getString(_pointerSizeKey),
      pointerSizeOptions,
      pointerSize.value,
    );
    pointerStyle.value = _validOption(
      preferences.getString(_pointerStyleKey),
      pointerStyleOptions,
      pointerStyle.value,
    );
  }

  String _validOption(String? saved, List<String> options, String fallback) {
    return saved != null && options.contains(saved) ? saved : fallback;
  }

  void _saveBool(String key, bool value) {
    final preferences = _preferences;
    if (preferences != null) unawaited(preferences.setBool(key, value));
  }

  void _saveDouble(String key, double value) {
    final preferences = _preferences;
    if (preferences != null) unawaited(preferences.setDouble(key, value));
  }

  void _saveString(String key, String value) {
    final preferences = _preferences;
    if (preferences != null) unawaited(preferences.setString(key, value));
  }

  /// [updateTicker]: false keeps the event in the activity log but out of the
  /// Remote screen's last-action ticker (e.g. theme changes are settings-only).
  void addLog(String event, {bool updateTicker = true}) {
    final publicEvent = _publicDiagnosticText(event);
    final now = DateTime.now();
    final timestamp =
        "${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}:${now.second.toString().padLeft(2, '0')}";
    _activityLog.insert(0, LogItem(publicEvent, timestamp));
    if (_activityLog.length > 50) _activityLog.removeLast();
    if (updateTicker) lastAction.value = publicEvent;
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
    final cleanIp = normalizeRemoteLinkHost(ip);
    final cleanCode = code.trim();
    if (_pendingConnect != null && !_pendingConnect!.isCompleted) {
      _pendingConnect!.complete();
    }
    _pendingConnect = null;
    await _pairingService.disconnect(sendMessage: false);
    _hostIp = cleanIp;
    _pairingCode = cleanCode;
    _status = ConnectionStatus.connecting;
    _lastConnectionError = null;
    _sessionId = null;
    _detectedMonitors = const [];
    _clearPreviewStream();
    _previewStreamRequested = false;
    _heldModifiers.clear();
    _selectedMonitorId = null;
    addLog('Connecting to PC locally', updateTicker: false);
    notifyListeners();

    final connectCompleter = Completer<void>();
    _pendingConnect = connectCompleter;
    try {
      await _pairingService.connect(cleanIp, cleanCode);
    } catch (error) {
      _status = ConnectionStatus.failed;
      _lastConnectionError = _publicDiagnosticText(error.toString());
      _detectedMonitors = const [];
      _clearPreviewStream();
      _sessionId = null;
      _completePendingConnect();
      notifyListeners();
    }
    return connectCompleter.future;
  }

  Future<List<DiscoveryResult>> scanForDesktops() async {
    addLog('Discovery scan started');
    try {
      final results = await _discoveryScanner();
      if (results.isEmpty) {
        addLog('Discovery scan timed out: no RemoteLink desktop found');
      } else {
        final first = results.first;
        _hostIp = first.hostIp;
        addLog(
            'Discovery response received: ${first.name} ${first.hostIp}:${first.port}');
      }
      return results;
    } catch (error) {
      addLog('Discovery scan failed');
      return const [];
    }
  }

  void disconnect() {
    unawaited(stopMobileScreenShare(
      sendMessage: false,
      reason: 'Disconnected from host',
    ));
    unawaited(_pairingService.disconnect());
    _status = ConnectionStatus.disconnected;
    _heldModifiers.clear();
    _detectedMonitors = const [];
    _clearPreviewStream();
    _previewStreamRequested = false;
    _sessionId = null;
    _selectedMonitorId = null;
    addLog("Disconnected from host");
    notifyListeners();
  }

  Future<void> startMobileScreenShare() async {
    if (!isConnected) {
      setTransientAction('Connect to PC first');
      notifyListeners();
      return;
    }
    if (isPreviewStreaming) {
      setTransientAction('Stop PC preview before starting phone sharing.');
      addLog('Phone screen sharing blocked while PC preview is active',
          updateTicker: false);
      notifyListeners();
      return;
    }
    addLog('Start sharing tapped');
    _ignoreMobileScreenShareActiveEvents = false;
    _previewStreamRequested = false;
    _previewStreamStatus = PreviewStreamStatus.stopped;
    _previewStreamError = null;
    _latestPreviewFrame = null;
    _latestPreviewCursor = null;
    _pairingService.stopStream();
    await Future<void>.delayed(const Duration(milliseconds: 120));
    final requestId = ++_mobileScreenShareRequestId;
    if (!_mobileScreenShareService.isSupported) {
      _setMobileScreenShareStatus(
        MobileScreenShareStatus.error,
        errorMessage:
            'Phone screen sharing is available only on the Android app.',
      );
      addLog(_mobileScreenShareError!);
      notifyListeners();
      return;
    }
    _setMobileScreenShareStatus(MobileScreenShareStatus.starting);
    _mobileFrameSendCount = 0;
    addLog('Android screen-capture consent requested');
    notifyListeners();
    final accepted =
        await _mobileScreenShareService.startShare(requestId: requestId);
    if (requestId != _mobileScreenShareRequestId) {
      addLog('Ignoring stale start result after newer share request',
          updateTicker: false);
      return;
    }
    if (!accepted) {
      _setMobileScreenShareStatus(MobileScreenShareStatus.stopped);
      addLog('Screen sharing cancelled or unavailable');
      notifyListeners();
      return;
    }
    if (!isConnected) {
      addLog('Socket closed while sharing');
      unawaited(stopMobileScreenShare(
        sendMessage: false,
        reason: 'Socket closed while sharing',
      ));
      return;
    }
    _setMobileScreenShareStatus(MobileScreenShareStatus.starting);
    notifyListeners();
    _pairingService.sendMobileScreenStart(
      message: 'Android screen-capture consent requested',
    );
  }

  Future<void> stopMobileScreenShare({
    bool sendMessage = true,
    String reason = 'Sharing stopped',
  }) async {
    // Guard before any side effects: overlapping stop requests must not send
    // duplicate cleanup/stop messages. The in-flight call already performs the
    // full teardown, so re-entrant calls are safely dropped.
    if (_mobileScreenShareStopInFlight) {
      return;
    }
    _mobileScreenShareStopInFlight = true;
    final shouldSendStop = sendMessage && isConnected;
    final requestId = _mobileScreenShareRequestId;
    _ignoreMobileScreenShareActiveEvents = true;
    final wasSharing = _hasMobileScreenShareActivity ||
        _latestMobileScreenFrame != null ||
        _mobileScreenShareStatus == MobileScreenShareStatus.error;
    try {
      if (wasSharing) {
        addLog('Local screen share cleanup started: $reason');
        _setMobileScreenShareStatus(MobileScreenShareStatus.stopping);
        addLog('Mobile screen share state: stopping -> stopped',
            updateTicker: false);
      }
      _resetMobileScreenShareState(logReset: wasSharing);
      notifyListeners();
      if (shouldSendStop && isConnected) {
        _pairingService.sendMobileScreenStop(message: reason);
      }
      final stopped =
          await _mobileScreenShareService.stopShare(requestId: requestId);
      addLog(
        stopped ? 'Native capture stopped' : 'Native capture stop requested',
        updateTicker: false,
      );
      addLog('Foreground service stop requested', updateTicker: false);
    } finally {
      _mobileScreenShareStopInFlight = false;
    }
  }

  void setActiveMonitor(int id) {
    if (!isConnected) {
      addLog('Connect to PC first');
      return;
    }
    if (id < 1 || id > detectedMonitorCount) {
      addLog('Screen selection unavailable');
      return;
    }
    final monitor = _detectedMonitors[id - 1];
    if (!_pairingService.selectMonitor(monitor.id)) {
      setTransientAction('Screen selection failed. Reconnect to PC.');
      return;
    }
    _selectedMonitorId = monitor.id;
    if (isPreviewStreaming) {
      _pairingService.startStream(monitor.id);
      _previewStreamStatus = PreviewStreamStatus.starting;
      _previewStreamError = null;
    }
    addLog("Switched to ${monitor.label}", updateTicker: false);
    notifyListeners();
  }

  void startPreviewStream() {
    if (!isConnected) {
      setTransientAction('Connect to PC first');
      notifyListeners();
      return;
    }
    if (isMobileScreenShareModeActive) {
      setTransientAction('Stop phone sharing before starting PC preview.');
      addLog('PC preview blocked while phone screen sharing is active',
          updateTicker: false);
      notifyListeners();
      return;
    }
    if (_detectedMonitors.isEmpty) {
      _previewStreamStatus = PreviewStreamStatus.error;
      _previewStreamError = 'No desktop screens detected';
      notifyListeners();
      return;
    }
    final monitorId = _selectedMonitorId ?? _validSelectedMonitorId(null);
    _previewStreamRequested = true;
    if (!_pairingService.startStream(monitorId)) {
      _previewStreamRequested = false;
      _previewStreamStatus = PreviewStreamStatus.error;
      _previewStreamError = 'Preview start failed. Reconnect to PC.';
      notifyListeners();
      return;
    }
    _previewStreamStatus = PreviewStreamStatus.starting;
    _previewStreamError = null;
    addLog('Starting screen preview', updateTicker: false);
    notifyListeners();
  }

  void stopPreviewStream() {
    _previewStreamRequested = false;
    if (_pairingService.stopStream()) {
      addLog('Stopped screen preview', updateTicker: false);
    }
    _previewStreamStatus = PreviewStreamStatus.stopped;
    _previewStreamError = null;
    _latestPreviewFrame = null;
    _latestPreviewFrameWidth = null;
    _latestPreviewFrameHeight = null;
    _latestPreviewCursor = null;
    notifyListeners();
  }

  void setPreviewFullscreen(bool value) {
    if (_isPreviewFullscreen == value) return;
    _isPreviewFullscreen = value;
    addLog(value ? 'Opened fullscreen preview' : 'Closed fullscreen preview');
    notifyListeners();
  }

  // Setters for Settings. addLog feeds the activity log + ticker only; the
  // Settings rows listen to their individual ValueNotifiers.
  void setAutoReconnect(bool val) {
    autoReconnect.value = val;
    _saveBool(_autoReconnectKey, val);
    addLog("Auto Reconnect: ${val ? 'on' : 'off'}");
  }

  void setLowLatencyMode(bool val) {
    lowLatencyMode.value = val;
    _saveBool(_lowLatencyModeKey, val);
    addLog("Low Latency Mode: ${val ? 'on' : 'off'}");
  }

  void setMouseSensitivity(double val) {
    mouseSensitivity.value = val;
    _saveDouble(_mouseSensitivityKey, val);
  }

  void setScrollVelocity(double val) {
    scrollVelocity.value = val;
    _saveDouble(_scrollVelocityKey, val);
  }

  void setTouchpadMode(String val) {
    touchpadMode.value = val;
    _saveString(_touchpadModeKey, val);
    addLog("Touchpad Mode: $val");
  }

  void setStreamResolution(String val) {
    streamResolution.value = val;
    _saveString(_streamResolutionKey, val);
    addLog("Stream Resolution: $val");
  }

  void setFrameRate(String val) {
    frameRate.value = val;
    _saveString(_frameRateKey, val);
    addLog("Frame Rate: $val");
  }

  void setThemeMode(String val) {
    themeMode.value = val;
    _saveString(_themeModeKey, val);
    addLog("Theme: $val", updateTicker: false);
  }

  void setRequirePcApproval(bool val) {
    requirePcApproval.value = val;
    _saveBool(_requirePcApprovalKey, val);
    addLog("PC Approval required: ${val ? 'on' : 'off'}");
  }

  void setShowTouchpadPointer(bool val) {
    showTouchpadPointer.value = val;
    _saveBool(_showTouchpadPointerKey, val);
    addLog("Touchpad Pointer: ${val ? 'on' : 'off'}", updateTicker: false);
  }

  void setPointerSize(String val) {
    if (!pointerSizeOptions.contains(val)) return;
    pointerSize.value = val;
    _saveString(_pointerSizeKey, val);
    addLog('Pointer Size: $val', updateTicker: false);
  }

  void setPointerStyle(String val) {
    if (!pointerStyleOptions.contains(val)) return;
    pointerStyle.value = val;
    _saveString(_pointerStyleKey, val);
    addLog('Pointer Style: $val', updateTicker: false);
  }

  void clearTrustedDevices() {
    addLog("Cleared all trusted device signatures");
  }

  void toggleModifier(String key) {
    if (!isConnected) {
      addLog('Connect to PC first');
      return;
    }
    if (isMobileScreenShareModeActive) {
      setTransientAction('Stop phone sharing first.');
      notifyListeners();
      return;
    }
    if (_heldModifiers.contains(key)) {
      _heldModifiers.remove(key);
      addLog("Released $key", updateTicker: false);
      sendCommandLog('key', {'key': key, 'state': 'released'});
    } else {
      _heldModifiers.add(key);
      addLog("Held $key", updateTicker: false);
      sendCommandLog('key', {'key': key, 'state': 'held'});
    }
    notifyListeners();
  }

  void releaseAllKeys() {
    if (!isConnected) {
      addLog('Connect to PC first');
      return;
    }
    if (isMobileScreenShareModeActive) {
      setTransientAction('Stop phone sharing first.');
      notifyListeners();
      return;
    }
    _heldModifiers.clear();
    addLog("All virtual keys released", updateTicker: false);
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

  bool sendCommandLog(String command, Map<String, dynamic> details) {
    if (!isConnected) {
      setTransientAction('Connect to PC first');
      return false;
    }
    if (isMobileScreenShareModeActive) {
      setTransientAction('Stop phone sharing first.');
      return false;
    }
    if (_pairingService.sendCommandLog(command, details)) return true;
    setTransientAction('Connection lost. Reconnect to PC.');
    return false;
  }

  void _handlePairingEvent(PairingEvent event) {
    switch (event.type) {
      case pairingDiagnosticEvent:
        addLog(_publicConnectionDiagnostic(event.message), updateTicker: true);
        notifyListeners();
        break;
      case MessageTypes.pairingPending:
        _status = ConnectionStatus.waitingApproval;
        addLog('Waiting for PC approval');
        notifyListeners();
        break;
      case MessageTypes.pairingApproved:
        _status = ConnectionStatus.connected;
        _sessionId = event.sessionId;
        _detectedMonitors = event.monitors;
        _selectedMonitorId = _validSelectedMonitorId(event.selectedMonitorId);
        addLog("Connected to PC locally ($_hostIp)");
        addLog("Detected $detectedMonitorCount screen(s)");
        _completePendingConnect();
        notifyListeners();
        break;
      case MessageTypes.monitorList:
        _detectedMonitors = event.monitors;
        _selectedMonitorId = _validSelectedMonitorId(event.selectedMonitorId);
        addLog("Updated monitor list: $detectedMonitorCount screen(s)");
        notifyListeners();
        break;
      case MessageTypes.streamStatus:
        final parsedStatus = _parseStreamStatus(event.streamStatus);
        if (!_previewStreamRequested &&
            parsedStatus != PreviewStreamStatus.stopped) {
          break;
        }
        _previewStreamStatus = parsedStatus;
        _previewStreamError = _previewStreamStatus == PreviewStreamStatus.error
            ? event.message ?? 'Preview stream error'
            : null;
        if (_previewStreamStatus == PreviewStreamStatus.stopped ||
            _previewStreamStatus == PreviewStreamStatus.error) {
          _latestPreviewFrame = null;
        }
        notifyListeners();
        break;
      case MessageTypes.screenFrame:
        if (!_previewStreamRequested) {
          break;
        }
        final frame = event.frame;
        if (frame != null) {
          _latestPreviewFrame = frame.bytes;
          _latestPreviewFrameWidth = frame.width;
          _latestPreviewFrameHeight = frame.height;
          if (frame.cursorVisible &&
              frame.cursorX != null &&
              frame.cursorY != null) {
            _latestPreviewCursor = Offset(frame.cursorX!, frame.cursorY!);
          } else {
            _latestPreviewCursor = null;
          }
          _selectedMonitorId = _validSelectedMonitorId(frame.monitorId);
          _previewStreamStatus = PreviewStreamStatus.active;
          _previewStreamError = null;
          notifyListeners();
        }
        break;
      case MessageTypes.mobileScreenStarted:
        addLog('Desktop acknowledged phone screen share', updateTicker: false);
        if (event.mobileScreenWidth != null && event.mobileScreenWidth! > 0) {
          _latestMobileScreenFrameWidth = event.mobileScreenWidth;
        }
        if (event.mobileScreenHeight != null && event.mobileScreenHeight! > 0) {
          _latestMobileScreenFrameHeight = event.mobileScreenHeight;
        }
        if (!_ignoreMobileScreenShareActiveEvents) {
          _setMobileScreenShareStatus(MobileScreenShareStatus.sharing);
          notifyListeners();
        }
        break;
      case MessageTypes.mobileScreenStop:
        addLog('Desktop requested phone screen sharing stop',
            updateTicker: false);
        unawaited(stopMobileScreenShare(
          sendMessage: false,
          reason: event.message ?? 'Stopped from desktop',
        ));
        break;
      case MessageTypes.mobileScreenStatus:
        final desktopStatus = event.mobileScreenStatus;
        if (desktopStatus == 'stopped' || desktopStatus == 'off') {
          final hasRecentFrame = _latestMobileScreenFrameAt != null &&
              DateTime.now().difference(_latestMobileScreenFrameAt!) <
                  const Duration(seconds: 3);
          if ((_mobileScreenShareStatus == MobileScreenShareStatus.sharing ||
                  hasRecentFrame) &&
              !_ignoreMobileScreenShareActiveEvents) {
            addLog('Ignored stale desktop stopped status during active share',
                updateTicker: false);
            break;
          }
          if (_hasMobileScreenShareActivity ||
              _latestMobileScreenFrame != null) {
            unawaited(stopMobileScreenShare(
              sendMessage: false,
              reason: event.message ?? 'Stopped by desktop',
            ));
          }
        } else if (desktopStatus == 'starting' || desktopStatus == 'sharing') {
          if (!_ignoreMobileScreenShareActiveEvents) {
            if (event.mobileScreenWidth != null &&
                event.mobileScreenWidth! > 0) {
              _latestMobileScreenFrameWidth = event.mobileScreenWidth;
            }
            if (event.mobileScreenHeight != null &&
                event.mobileScreenHeight! > 0) {
              _latestMobileScreenFrameHeight = event.mobileScreenHeight;
            }
            _setMobileScreenShareStatus(desktopStatus == 'sharing'
                ? MobileScreenShareStatus.sharing
                : MobileScreenShareStatus.starting);
            notifyListeners();
          }
        } else if (desktopStatus == 'error') {
          _setMobileScreenShareStatus(
            MobileScreenShareStatus.error,
            errorMessage:
                event.message ?? 'Desktop reported screen share error',
          );
          unawaited(_mobileScreenShareService.stopShare(
              requestId: _mobileScreenShareRequestId));
          notifyListeners();
        }
        break;
      case MessageTypes.pairingDenied:
        _cleanupMobileScreenShareForSocketClose(
            event.message ?? 'Pairing denied by desktop');
        _status = ConnectionStatus.denied;
        _lastConnectionError =
            _publicDiagnosticText(event.message ?? 'Pairing denied by desktop');
        _sessionId = null;
        _detectedMonitors = const [];
        _clearPreviewStream();
        _previewStreamRequested = false;
        _selectedMonitorId = null;
        _heldModifiers.clear();
        unawaited(_pairingService.disconnect(sendMessage: false));
        addLog(_lastConnectionError!);
        _completePendingConnect();
        notifyListeners();
        break;
      case MessageTypes.disconnect:
        _cleanupMobileScreenShareForSocketClose(
            event.message ?? 'Connection closed by desktop');
        _status = ConnectionStatus.disconnected;
        _sessionId = null;
        _detectedMonitors = const [];
        _clearPreviewStream();
        _previewStreamRequested = false;
        _selectedMonitorId = null;
        _heldModifiers.clear();
        addLog(event.message ?? 'Connection closed by desktop');
        _completePendingConnect();
        notifyListeners();
        break;
      case MessageTypes.error:
        _cleanupMobileScreenShareForSocketClose(
            event.message ?? 'Desktop connection error');
        _status = ConnectionStatus.failed;
        _lastConnectionError = _publicDiagnosticText(event.message ??
            'Connection failed. Start desktop app, turn engine ON, check Host IP, same Wi-Fi, and firewall.');
        _sessionId = null;
        _detectedMonitors = const [];
        _clearPreviewStream();
        _previewStreamRequested = false;
        _selectedMonitorId = null;
        _heldModifiers.clear();
        unawaited(_pairingService.disconnect(sendMessage: false));
        addLog(_lastConnectionError!);
        _completePendingConnect();
        notifyListeners();
        break;
    }
  }

  bool get _hasMobileScreenShareActivity =>
      _mobileScreenShareStatus == MobileScreenShareStatus.starting ||
      _mobileScreenShareStatus == MobileScreenShareStatus.sharing ||
      _mobileScreenShareStatus == MobileScreenShareStatus.stopping;

  bool get _canAcceptMobileFrame =>
      _mobileScreenShareStatus != MobileScreenShareStatus.stopping &&
      _mobileScreenShareStatus != MobileScreenShareStatus.error;

  void _setMobileScreenShareStatus(
    MobileScreenShareStatus status, {
    String? errorMessage,
  }) {
    if (_mobileScreenShareStatus != status) {
      addLog(
        'Mobile screen share state: ${_mobileScreenShareStatus.name} -> ${status.name}',
        updateTicker: false,
      );
    }
    _mobileScreenShareStatus = status;
    if (status == MobileScreenShareStatus.error) {
      _mobileScreenShareError = errorMessage ?? 'Mobile screen share error';
    } else {
      _mobileScreenShareError = null;
    }
  }

  void _handleMobileScreenShareEvent(MobileScreenShareEvent event) {
    final eventRequestId = event.requestId;
    if (eventRequestId != null &&
        eventRequestId != _mobileScreenShareRequestId) {
      addLog(
        'Ignoring stale mobile share event for request $eventRequestId',
        updateTicker: false,
      );
      return;
    }
    switch (event.type) {
      case 'status':
        final incomingStatus = event.status ?? MobileScreenShareStatus.off;
        final incomingIsActive =
            incomingStatus == MobileScreenShareStatus.starting ||
                incomingStatus == MobileScreenShareStatus.sharing;
        if (_ignoreMobileScreenShareActiveEvents && incomingIsActive) {
          addLog('Ignoring stale native sharing status after local stop',
              updateTicker: false);
          break;
        }
        if (_ignoreMobileScreenShareActiveEvents &&
            incomingStatus == MobileScreenShareStatus.error) {
          addLog(
            'Ignoring native share error after local stop: ${event.message ?? 'no details'}',
            updateTicker: false,
          );
          break;
        }
        if (!isConnected &&
            (incomingStatus == MobileScreenShareStatus.starting ||
                incomingStatus == MobileScreenShareStatus.sharing)) {
          addLog('Ignoring native sharing status after socket closed');
          unawaited(stopMobileScreenShare(
            sendMessage: false,
            reason: 'Socket closed while sharing',
          ));
          break;
        }
        final previousStatus = _mobileScreenShareStatus;
        _setMobileScreenShareStatus(incomingStatus);
        if (event.width != null && event.width! > 0) {
          _latestMobileScreenFrameWidth = event.width;
        }
        if (event.height != null && event.height! > 0) {
          _latestMobileScreenFrameHeight = event.height;
        }
        if (incomingStatus == MobileScreenShareStatus.error) {
          _setMobileScreenShareStatus(
            MobileScreenShareStatus.error,
            errorMessage: event.message ?? 'Mobile screen share error',
          );
        } else if (!(previousStatus == MobileScreenShareStatus.error &&
            (_mobileScreenShareStatus == MobileScreenShareStatus.stopped ||
                _mobileScreenShareStatus == MobileScreenShareStatus.off))) {
          _mobileScreenShareError = null;
        }
        final keepFailureVisible =
            previousStatus == MobileScreenShareStatus.error &&
                (_mobileScreenShareStatus == MobileScreenShareStatus.stopped ||
                    _mobileScreenShareStatus == MobileScreenShareStatus.off) &&
                _mobileScreenShareError != null;
        _pairingService.sendMobileScreenStatus(
          keepFailureVisible
              ? MobileScreenShareStatus.error.name
              : _mobileScreenShareStatus.name,
          message: keepFailureVisible ? _mobileScreenShareError : event.message,
          width: event.width ?? _latestMobileScreenFrameWidth,
          height: event.height ?? _latestMobileScreenFrameHeight,
          fps: event.fps,
          lastFrameAt: event.lastFrameAt,
        );
        if (_mobileScreenShareStatus == MobileScreenShareStatus.stopped ||
            _mobileScreenShareStatus == MobileScreenShareStatus.off ||
            _mobileScreenShareStatus == MobileScreenShareStatus.error) {
          _latestMobileScreenFrame = null;
          _latestMobileScreenFrameWidth = null;
          _latestMobileScreenFrameHeight = null;
          _latestMobileScreenFrameAt = null;
          _mobileFrameSendCount = 0;
        }
        if (_mobileScreenShareStatus == MobileScreenShareStatus.sharing) {
          addLog('Native mobile capture started', updateTicker: false);
        } else if (_mobileScreenShareStatus ==
            MobileScreenShareStatus.stopped) {
          addLog(event.message ?? 'Mobile screen sharing stopped',
              updateTicker: false);
        } else if (_mobileScreenShareStatus == MobileScreenShareStatus.error) {
          addLog(event.message ?? 'Mobile screen sharing error');
        }
        notifyListeners();
        break;
      case 'frame':
        if (_ignoreMobileScreenShareActiveEvents || !_canAcceptMobileFrame) {
          addLog(
              "Ignored stale mobile share event with requestId ${event.requestId ?? 'missing'}",
              updateTicker: false);
          break;
        }
        if (!isConnected) {
          addLog('Ignoring mobile screen frame after socket closed',
              updateTicker: false);
          unawaited(stopMobileScreenShare(
            sendMessage: false,
            reason: 'Socket closed while sharing',
          ));
          break;
        }
        final frame = event.frame;
        if (frame == null) break;
        final wasSharing =
            _mobileScreenShareStatus == MobileScreenShareStatus.sharing;
        _latestMobileScreenFrame = frame.bytes;
        _latestMobileScreenFrameWidth = frame.width;
        _latestMobileScreenFrameHeight = frame.height;
        _latestMobileScreenFrameAt = frame.timestamp;
        _setMobileScreenShareStatus(MobileScreenShareStatus.sharing);
        if (_pairingService.sendMobileScreenFrame(frame)) {
          _mobileFrameSendCount += 1;
          // Only announce the transition into sharing; every frame already
          // carries its own dimensions/timestamp, so per-frame status packets
          // are redundant. State transitions still emit status below.
          if (!wasSharing) {
            _pairingService.sendMobileScreenStatus(
              MobileScreenShareStatus.sharing.name,
              message: 'Phone screen is live',
              width: frame.width,
              height: frame.height,
              lastFrameAt: frame.timestamp.toUtc().toIso8601String(),
            );
          }
          if (_mobileFrameSendCount == 1 || _mobileFrameSendCount % 30 == 0) {
            addLog(
              'Mobile screen frame sent to desktop (${frame.width}x${frame.height})',
              updateTicker: false,
            );
          }
        } else {
          const message = 'Mobile screen frame could not be sent';
          _setMobileScreenShareStatus(
            MobileScreenShareStatus.error,
            errorMessage: message,
          );
          _pairingService.sendMobileScreenStatus('error', message: message);
          unawaited(_mobileScreenShareService.stopShare());
        }
        notifyListeners();
        break;
    }
  }

  void _cleanupMobileScreenShareForSocketClose(String reason) {
    if (_hasMobileScreenShareActivity ||
        _latestMobileScreenFrame != null ||
        _mobileScreenShareStatus == MobileScreenShareStatus.error) {
      addLog('Socket closed while sharing');
    }
    unawaited(stopMobileScreenShare(
      sendMessage: false,
      reason: reason,
    ));
  }

  void _resetMobileScreenShareState({bool logReset = false}) {
    _mobileScreenShareStatus = MobileScreenShareStatus.stopped;
    _mobileScreenShareError = null;
    _latestMobileScreenFrame = null;
    _latestMobileScreenFrameWidth = null;
    _latestMobileScreenFrameHeight = null;
    _latestMobileScreenFrameAt = null;
    _mobileFrameSendCount = 0;
    if (logReset) {
      addLog('Share state reset', updateTicker: false);
    }
  }

  void _completePendingConnect() {
    if (_pendingConnect != null && !_pendingConnect!.isCompleted) {
      _pendingConnect!.complete();
    }
    _pendingConnect = null;
  }

  String? _validSelectedMonitorId(String? requestedId) {
    if (_detectedMonitors.isEmpty) return null;
    if (requestedId != null &&
        _detectedMonitors.any((monitor) => monitor.id == requestedId)) {
      return requestedId;
    }
    for (final monitor in _detectedMonitors) {
      if (monitor.isPrimary) return monitor.id;
    }
    return _detectedMonitors.first.id;
  }

  PreviewStreamStatus _parseStreamStatus(String? value) {
    switch (value) {
      case 'starting':
        return PreviewStreamStatus.starting;
      case 'active':
        return PreviewStreamStatus.active;
      case 'error':
        return PreviewStreamStatus.error;
      case 'stopped':
      default:
        return PreviewStreamStatus.stopped;
    }
  }

  void _clearPreviewStream() {
    _previewStreamRequested = false;
    _previewStreamStatus = PreviewStreamStatus.stopped;
    _latestPreviewFrame = null;
    _latestPreviewFrameWidth = null;
    _latestPreviewFrameHeight = null;
    _latestPreviewCursor = null;
    _previewStreamError = null;
  }

  String _publicConnectionDiagnostic(String? message) {
    return _publicDiagnosticText(message ?? 'Connection diagnostic');
  }

  String _publicDiagnosticText(String message) {
    final value = message.trim();
    final lower = value.toLowerCase();
    if (lower.contains('tcp pre'
            'flight') ||
        lower.contains('web'
            'socket') ||
        lower.contains('socket'
            'exception') ||
        lower.contains('connection refused') ||
        lower.contains('connection timed out') ||
        lower.contains('no route to host') ||
        (lower.contains('ws') && lower.contains('://'))) {
      return 'Connection check failed';
    }
    if (lower.contains('socket opened') ||
        lower.contains('pairing request sent')) {
      return 'Connection request sent';
    }
    if (lower.contains('target ')) {
      return 'Checking desktop connection';
    }
    return value.isEmpty
        ? 'Connection diagnostic'
        : value
            .replaceAll(RegExp(r'wss?:\/\/[^\s,)]+', caseSensitive: false),
                'local connection')
            .replaceAll(
                RegExp(r'\b\d{1,3}(?:\.\d{1,3}){3}:\d+\b'), 'local connection')
            .replaceAll(RegExp(r'\s+'), ' ');
  }
}
