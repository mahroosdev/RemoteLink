import 'dart:async';

import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import '../widgets/status_pill.dart';
import '../widgets/shortcut_key_button.dart';
import '../widgets/touchpad_area.dart';
import '../widgets/screen_preview.dart';
import '../widgets/mouse_click_icon.dart';
import '../services/mobile_screen_share_service.dart';
import '../models/app_state.dart';
import 'fullscreen_preview_screen.dart';

/// Normal Remote controls stay portrait-only. Landscape is reserved for the
/// fullscreen preview route.
class RemoteControlScreen extends StatefulWidget {
  final AppState state;

  const RemoteControlScreen({super.key, required this.state});

  @override
  State<RemoteControlScreen> createState() => _RemoteControlScreenState();
}

class _RemoteControlScreenState extends State<RemoteControlScreen> {
  final _textController = TextEditingController();
  Timer? _touchpadMoveTimer;
  double _touchpadDx = 0;
  double _touchpadDy = 0;
  bool _touchpadDragActive = false;

  // Portrait accordions may have several groups open at once.
  final Set<String> _expandedGroups = {'Basic Keys', 'Actions'};
  int _toolTab = 0; // 0 = Mouse, 1 = Keyboard, 2 = Shortcuts
  int _remoteSection = 0; // 0 = Computer, 1 = Phone
  bool _touchpadActive = false;

  AppState get state => widget.state;

  @override
  void dispose() {
    if (_touchpadDragActive && state.isConnected) {
      state.sendCommandLog('left_button_up', {'source': 'touchpad_dispose'});
    }
    _touchpadDragActive = false;
    _touchpadMoveTimer?.cancel();
    _textController.dispose();
    super.dispose();
  }

  void _sendText() {
    final text = _textController.text;
    if (text.isEmpty) {
      // In-page feedback via the ticker — a SnackBar here would animate over
      // the whole page on every tap.
      state.setTransientAction('Nothing to send — type something first');
      return;
    }
    if (_sendControlCommand('text', {'text': text}, 'Sent text: $text')) {
      _textController.clear();
    }
  }

  void _showFeedback(String message) {
    if (!mounted) return;
    final c = context.colors;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Row(
            children: [
              Icon(Icons.info_outline_rounded, size: 18, color: c.amber),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  message,
                  style: TextStyle(
                    color: c.textPrimary,
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
          backgroundColor: c.elevatedCard,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
            side: BorderSide(color: c.border),
          ),
          behavior: SnackBarBehavior.floating,
          duration: const Duration(milliseconds: 1400),
        ),
      );
  }

  void _showModeBlocked(String message) {
    state.setTransientAction(message);
    _showFeedback(message);
  }

  void _changeRemoteSection(int value) {
    if (value == _remoteSection) return;
    if (value == 0 && state.isMobileScreenShareModeActive) {
      _showModeBlocked('Stop phone sharing first.');
      return;
    }
    if (value == 1 && state.isPreviewStreaming) {
      _showModeBlocked('Stop PC preview first.');
      return;
    }
    setState(() => _remoteSection = value);
  }

  void _toggleModifier(String key) {
    final wasConnected = state.isConnected;
    state.toggleModifier(key);
    if (!wasConnected) _showFeedback('Connect to PC first');
  }

  void _releaseAllKeys() {
    final wasConnected = state.isConnected;
    state.releaseAllKeys();
    if (!wasConnected) _showFeedback('Connect to PC first');
  }

  Future<void> _openFullscreen() async {
    state.setPreviewFullscreen(true);
    await Navigator.of(context, rootNavigator: true).push(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => FullscreenPreviewScreen(state: state),
      ),
    );
    state.setPreviewFullscreen(false);
  }

  void _toggleGroup(String title) {
    setState(() {
      if (!_expandedGroups.remove(title)) _expandedGroups.add(title);
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: _buildPortrait(context),
      ),
    );
  }

  Widget _buildPortrait(BuildContext context) {
    return ScrollConfiguration(
      behavior: const _RemoteScrollBehavior(),
      child: SingleChildScrollView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        physics: _touchpadActive
            ? const NeverScrollableScrollPhysics()
            : const ClampingScrollPhysics(),
        child: Center(
          child: ConstrainedBox(
            // Preview, touchpad and all controls share one controlled width.
            constraints: const BoxConstraints(maxWidth: 480),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _RemoteSectionSwitcher(
                    selected: _remoteSection,
                    onChanged: _changeRemoteSection,
                  ),
                  const SizedBox(height: 12),
                  AnimatedSwitcher(
                    duration: const Duration(milliseconds: 160),
                    switchInCurve: Curves.easeOut,
                    switchOutCurve: Curves.easeIn,
                    child: _remoteSection == 0
                        ? _buildPcControlSection(context)
                        : _buildPhoneShareSection(context),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildPcControlSection(BuildContext context) {
    return _buildSection(
      context,
      key: const ValueKey('pc-control-section'),
      title: 'Computer',
      subtitle: 'Control your computer from this phone.',
      icon: Icons.computer_outlined,
      children: [
        _StatusHeaderCard(state: state),
        const SizedBox(height: 12),
        _buildPreviewBlock(context),
        const SizedBox(height: 12),
        _buildToolTabBar(),
        const SizedBox(height: 12),
        _buildToolTabContent(context),
      ],
    );
  }

  Widget _buildPhoneShareSection(BuildContext context) {
    return ListenableBuilder(
      key: const ValueKey('phone-share-section'),
      listenable: state,
      builder: (context, _) {
        final c = context.colors;
        return Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: c.card,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: c.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _buildMobileShareCard(context),
              const SizedBox(height: 10),
              _buildPhoneShareInfoPanel(context),
            ],
          ),
        );
      },
    );
  }

  Widget _buildSection(
    BuildContext context, {
    Key? key,
    required String title,
    required String subtitle,
    required IconData icon,
    required List<Widget> children,
  }) {
    final c = context.colors;
    return Container(
      key: key,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: c.card,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: c.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(icon, size: 18, color: c.blue),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: TextStyle(
                        color: c.textPrimary,
                        fontSize: 14,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 11, color: c.textSecondary),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          ...children,
        ],
      ),
    );
  }

  Widget _buildPhoneShareInfoPanel(BuildContext context) {
    final c = context.colors;
    final resolution = state.latestMobileScreenFrameWidth != null &&
            state.latestMobileScreenFrameHeight != null
        ? '${state.latestMobileScreenFrameWidth} x ${state.latestMobileScreenFrameHeight}'
        : '--';
    final frameStatus = state.latestMobileScreenFrameAt != null
        ? _formatFrameTime(state.latestMobileScreenFrameAt!)
        : '--';
    final isLive = state.isMobileScreenSharing;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: c.card,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: c.border.withValues(alpha: 0.75)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(Icons.verified_user_outlined, size: 16, color: c.blue),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Share Status',
                  style: TextStyle(
                    color: c.textPrimary,
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _ShareDiagnosticItem(
                  label: 'Desktop',
                  value: state.isConnected ? 'READY' : 'OFFLINE',
                ),
              ),
              Expanded(
                child: _ShareDiagnosticItem(
                  label: 'Capture',
                  value: state.mobileScreenShareStatus.name.toUpperCase(),
                ),
              ),
              Expanded(
                child: _ShareDiagnosticItem(
                  label: 'Frames',
                  value: frameStatus == '--' ? 'WAITING' : 'LIVE',
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: isLive
                  ? c.green.withValues(alpha: 0.10)
                  : c.elevatedCard.withValues(alpha: 0.78),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                color: isLive
                    ? c.green.withValues(alpha: 0.35)
                    : c.border.withValues(alpha: 0.75),
              ),
            ),
            child: Row(
              children: [
                Icon(
                  isLive ? Icons.cast_connected_rounded : Icons.cast_rounded,
                  size: 18,
                  color: isLive ? c.green : c.textMuted,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    isLive
                        ? 'Your phone screen is being sent to the desktop app.'
                        : 'Tap Start Sharing and approve Android screen capture.',
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: isLive ? c.textPrimary : c.textSecondary,
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
          ),
          if (resolution != '--') ...[
            const SizedBox(height: 10),
            Text(
              'Resolution $resolution',
              style: TextStyle(
                color: c.textMuted,
                fontSize: 10,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ],
      ),
    );
  }

  String _formatFrameTime(DateTime value) {
    final local = value.toLocal();
    final hour = local.hour.toString().padLeft(2, '0');
    final minute = local.minute.toString().padLeft(2, '0');
    final second = local.second.toString().padLeft(2, '0');
    return '$hour:$minute:$second';
  }

  // ------------------------------------------------------------ shared parts

  Widget _buildMobileShareCard(BuildContext context) {
    final c = context.colors;
    final status = state.mobileScreenShareStatus;
    final isSharing = status == MobileScreenShareStatus.sharing;
    final isStarting = status == MobileScreenShareStatus.starting;
    final isStopping = status == MobileScreenShareStatus.stopping;
    final isBusy = isStarting || isStopping;
    final blockedByPreview = state.isPreviewStreaming && !isSharing;
    final unsupportedShare = !state.isMobileScreenShareSupported ||
        state.mobileScreenShareError ==
            'Phone screen sharing is available only on the Android app.';
    final statusLabel = switch (status) {
      MobileScreenShareStatus.starting => 'Starting',
      MobileScreenShareStatus.sharing => 'Sharing',
      MobileScreenShareStatus.stopping => 'Stopping',
      MobileScreenShareStatus.stopped => 'Stopped',
      MobileScreenShareStatus.error => 'Error',
      MobileScreenShareStatus.off => 'Off',
    };
    final message = blockedByPreview
        ? 'Stop PC preview before starting phone sharing.'
        : state.mobileScreenShareError ??
            _mobileShareMessage(
              status: status,
              isConnected: state.isConnected,
              unsupportedShare: unsupportedShare,
            );
    final buttonLabel = unsupportedShare
        ? 'Android only'
        : isStarting
            ? 'Starting...'
            : isStopping
                ? 'Stopping...'
                : isSharing
                    ? 'Stop Sharing'
                    : blockedByPreview
                        ? 'Stop Preview First'
                        : !state.isConnected
                            ? 'Connect to PC first'
                            : 'Start Sharing';
    const showMessage = true;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: c.card,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: c.border),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(Icons.screen_share_outlined, size: 18, color: c.blue),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Share phone screen to PC',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: c.textPrimary,
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                decoration: BoxDecoration(
                  color: _shareStatusColor(c, status).withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  (status == MobileScreenShareStatus.off
                          ? 'Stopped'
                          : statusLabel)
                      .toUpperCase(),
                  style: TextStyle(
                    color: _shareStatusColor(c, status),
                    fontSize: 9,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
          if (showMessage) ...[
            const SizedBox(height: 6),
            Text(
              message,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 11, color: c.textSecondary),
            ),
          ],
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: _MobileShareToggleButton(
                  label: buttonLabel,
                  isSharing: isSharing,
                  isEnabled: !unsupportedShare &&
                      !isBusy &&
                      (isSharing || state.isConnected),
                  onTap: isSharing
                      ? () => state.stopMobileScreenShare()
                      : blockedByPreview
                          ? () => _showModeBlocked('Stop PC preview first.')
                          : () => state.startMobileScreenShare(),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Color _shareStatusColor(AppColors c, MobileScreenShareStatus status) {
    return switch (status) {
      MobileScreenShareStatus.sharing => c.green,
      MobileScreenShareStatus.error => c.red,
      MobileScreenShareStatus.starting ||
      MobileScreenShareStatus.stopping =>
        c.blue,
      MobileScreenShareStatus.stopped ||
      MobileScreenShareStatus.off =>
        c.textMuted,
    };
  }

  String _mobileShareMessage({
    required MobileScreenShareStatus status,
    required bool isConnected,
    required bool unsupportedShare,
  }) {
    if (unsupportedShare) {
      return 'Phone screen sharing is available only on the Android app.';
    }
    return switch (status) {
      MobileScreenShareStatus.sharing => 'Phone screen is live on the PC',
      MobileScreenShareStatus.starting => 'Waiting for Android capture consent',
      MobileScreenShareStatus.stopping => 'Stopping phone screen sharing',
      MobileScreenShareStatus.error => 'Phone screen sharing failed',
      MobileScreenShareStatus.stopped ||
      MobileScreenShareStatus.off =>
        isConnected
            ? 'Phone screen sharing is stopped'
            : 'Connect to PC before sharing your phone screen',
    };
  }

  Widget _buildPreviewBlock(BuildContext context) {
    return ListenableBuilder(
      listenable: state,
      builder: (context, _) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Stack(
            children: [
              ValueListenableBuilder<String>(
                valueListenable: state.pointerSize,
                builder: (context, pointerSize, _) =>
                    ValueListenableBuilder<String>(
                  valueListenable: state.pointerStyle,
                  builder: (context, pointerStyle, _) => ScreenPreview(
                    isConnected: state.isConnected,
                    activeMonitor: state.activeMonitor,
                    streamStatus: state.previewStreamStatus,
                    frameBytes: state.latestPreviewFrame,
                    streamError: state.previewStreamError,
                    cursorPosition: state.latestPreviewCursor,
                    frameWidth: state.latestPreviewFrameWidth,
                    frameHeight: state.latestPreviewFrameHeight,
                    pointerSize: pointerSize,
                    pointerStyle: pointerStyle,
                  ),
                ),
              ),
              Positioned(
                right: 8,
                bottom: 8,
                child: _FullscreenPreviewButton(
                  onTap: _openFullscreen,
                  overlay: true,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          _buildPreviewControls(context),
        ],
      ),
    );
  }

  Widget _buildPreviewControls(BuildContext context) {
    final isStreaming = state.isPreviewStreaming;
    final previewButton = _PreviewToggleButton(
      isStreaming: isStreaming,
      isEnabled: isStreaming || state.isConnected,
      label: !isStreaming && state.isMobileScreenShareModeActive
          ? 'Stop Share First'
          : null,
      onTap: isStreaming
          ? state.stopPreviewStream
          : state.isMobileScreenShareModeActive
              ? () => _showModeBlocked('Stop phone sharing first.')
              : state.startPreviewStream,
    );
    final monitorButtons = <Widget>[
      for (var id = 1; id <= state.detectedMonitorCount; id++)
        _CompactMonitorButton(
          label: '$id',
          isActive: state.activeMonitor == id,
          onTap: () {
            final wasSelected = state.activeMonitor == id;
            state.setActiveMonitor(id);
            if (!state.isConnected) {
              _showFeedback('Connect to PC first');
            } else if (!wasSelected && state.activeMonitor != id) {
              _showFeedback('Screen selection failed');
            }
          },
        ),
    ];
    final hint = _PreviewControlsHint(
      message: state.isConnected
          ? 'No desktop screens detected'
          : 'Connect to PC to load screens',
    );

    return LayoutBuilder(
      builder: (context, constraints) {
        if (monitorButtons.isEmpty) {
          return Row(
            children: [
              Expanded(child: hint),
              const SizedBox(width: 8),
              SizedBox(width: 136, child: previewButton),
            ],
          );
        }

        return Container(
          height: 52,
          padding: const EdgeInsets.all(4),
          decoration: BoxDecoration(
            color: context.colors.card,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: context.colors.border),
          ),
          child: Row(
            children: [
              Expanded(
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  physics: const ClampingScrollPhysics(),
                  child: Row(
                    children: [
                      for (var index = 0;
                          index < monitorButtons.length;
                          index++) ...[
                        monitorButtons[index],
                        if (index != monitorButtons.length - 1)
                          const SizedBox(width: 6),
                      ],
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 12),
              SizedBox(width: 142, child: previewButton),
            ],
          ),
        );
      },
    );
  }

  Widget _buildToolTabBar() {
    return ListenableBuilder(
      listenable: state,
      builder: (context, _) => _ToolTabBar(
        selected: _toolTab,
        heldCount: state.heldModifiers.length,
        onSelect: (index) => setState(() => _toolTab = index),
      ),
    );
  }

  Widget _buildToolTabContent(BuildContext context) {
    switch (_toolTab) {
      case 1:
        return _buildKeyboardTools();
      case 2:
        return _buildShortcutTools();
      case 0:
      default:
        return _buildMouseTools(context);
    }
  }

  Widget _buildMouseTools(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _buildTouchpad(height: 176),
        const SizedBox(height: 12),
        ..._buildMouseGrid(context),
      ],
    );
  }

  Widget _buildKeyboardTools() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _buildTypingBar(context),
        const SizedBox(height: 16),
        _buildBasicKeysGroup(),
        const SizedBox(height: 8),
        _buildModifiersGroup(),
      ],
    );
  }

  Widget _buildShortcutTools() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _buildActionsGroup(),
        const SizedBox(height: 8),
        _buildFunctionKeysGroup(),
      ],
    );
  }

  Widget _buildBasicKeysGroup() {
    return _ShortcutGroup(
      title: 'Basic Keys',
      icon: Icons.keyboard_outlined,
      expanded: _expandedGroups.contains('Basic Keys'),
      onToggle: () => _toggleGroup('Basic Keys'),
      children: _basicKeyChips(),
    );
  }

  Widget _buildModifiersGroup() {
    return ListenableBuilder(
      listenable: state,
      builder: (context, _) => _ShortcutGroup(
        title: 'Modifiers',
        icon: Icons.keyboard_command_key,
        badge: state.heldModifiers.isEmpty
            ? null
            : '${state.heldModifiers.length} HELD',
        expanded: _expandedGroups.contains('Modifiers'),
        onToggle: () => _toggleGroup('Modifiers'),
        children: _modifierChips(),
      ),
    );
  }

  Widget _buildActionsGroup() {
    return _ShortcutGroup(
      title: 'Actions',
      icon: Icons.flash_on_outlined,
      expanded: _expandedGroups.contains('Actions'),
      onToggle: () => _toggleGroup('Actions'),
      children: _actionChips(),
    );
  }

  Widget _buildFunctionKeysGroup() {
    return ListenableBuilder(
      listenable: state,
      builder: (context, _) => _ShortcutGroup(
        title: 'Function Keys',
        icon: Icons.functions,
        expanded: state.showFunctionKeys,
        onToggle: state.toggleFunctionKeys,
        children: _functionKeyChips(),
      ),
    );
  }

  Widget _buildTouchpad({required double height}) {
    return ValueListenableBuilder<bool>(
      valueListenable: state.showTouchpadPointer,
      builder: (context, showPointer, _) => TouchpadArea(
        height: height,
        showPointer: showPointer,
        onTouchActiveChanged: (active) {
          if (_touchpadActive == active || !mounted) return;
          setState(() => _touchpadActive = active);
        },
        onMove: (delta) {
          _queueTouchpadMove(delta);
        },
        onMoveEnd: () {
          _flushTouchpadMove();
        },
        onTap: () {
          _sendControlCommand(
              'left_click', {'source': 'touchpad_tap'}, 'Left click sent');
        },
        onDoubleTap: () {
          _sendControlCommand('left_click', {'clicks': 2}, 'Double click sent');
        },
        onDragStart: _startTouchpadDrag,
        onDragEnd: _stopTouchpadDrag,
        onLongPress: () {
          _sendControlCommand('right_click', {'source': 'touchpad_long_press'},
              'Right click sent');
        },
      ),
    );
  }

  List<Widget> _buildMouseGrid(BuildContext context) {
    final c = context.colors;
    return [
      Row(
        children: [
          _MouseButton(
            label: 'Left Click',
            icon: MouseClickIcon(
                outline: c.textSecondary, highlight: c.textPrimary),
            onTap: () =>
                _sendControlCommand('left_click', {}, 'Left click sent'),
          ),
          const SizedBox(width: 8),
          _MouseButton(
            label: 'Right Click',
            icon: MouseClickIcon(
                right: true,
                outline: c.textSecondary,
                highlight: c.textPrimary),
            onTap: () =>
                _sendControlCommand('right_click', {}, 'Right click sent'),
          ),
        ],
      ),
      const SizedBox(height: 8),
      Row(
        children: [
          _MouseButton(
            label: 'Scroll Up',
            icon:
                Icon(Icons.keyboard_arrow_up, size: 18, color: c.textSecondary),
            onTap: () => _sendControlCommand('scroll_up', {}, 'Scroll up sent'),
          ),
          const SizedBox(width: 8),
          _MouseButton(
            label: 'Scroll Down',
            icon: Icon(Icons.keyboard_arrow_down,
                size: 18, color: c.textSecondary),
            onTap: () =>
                _sendControlCommand('scroll_down', {}, 'Scroll down sent'),
          ),
        ],
      ),
    ];
  }

  Widget _buildTypingBar(BuildContext context) {
    final c = context.colors;
    return Row(
      children: [
        Expanded(
          child: TextField(
            controller: _textController,
            onSubmitted: (_) => _sendText(),
            decoration: InputDecoration(
              hintText: 'Type to PC...',
              isDense: true,
              contentPadding:
                  const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              border:
                  OutlineInputBorder(borderRadius: BorderRadius.circular(30)),
            ),
          ),
        ),
        const SizedBox(width: 8),
        IconButton(
          icon: Icon(Icons.send_rounded, color: c.blue),
          tooltip: 'Send to PC',
          onPressed: _sendText,
        ),
      ],
    );
  }

  List<Widget> _basicKeyChips() => [
        ShortcutKeyButton(label: 'Esc', onTap: () => _sendKey('Esc')),
        ShortcutKeyButton(label: 'Tab', onTap: () => _sendKey('Tab')),
        ShortcutKeyButton(label: 'Enter', onTap: () => _sendKey('Enter')),
        ShortcutKeyButton(label: 'Del', onTap: () => _sendKey('Del')),
        ShortcutKeyButton(
            label: 'Backspace', onTap: () => _sendKey('Backspace')),
      ];

  List<Widget> _modifierChips() => [
        for (final key in const ['Ctrl', 'Alt', 'Shift', 'Win'])
          ShortcutKeyButton(
            label: key,
            isHeld: state.heldModifiers.contains(key),
            onTap: () => _toggleModifier(key),
          ),
        ShortcutKeyButton(
          label: 'Release All Keys',
          isDanger: true,
          onTap: _releaseAllKeys,
        ),
      ];

  List<Widget> _actionChips() => [
        ShortcutKeyButton(
            label: 'Cut', onTap: () => _sendShortcut('Cut', 'Ctrl+X')),
        ShortcutKeyButton(
            label: 'Copy', onTap: () => _sendShortcut('Copy', 'Ctrl+C')),
        ShortcutKeyButton(
            label: 'Paste', onTap: () => _sendShortcut('Paste', 'Ctrl+V')),
        ShortcutKeyButton(
            label: 'Alt+Tab', onTap: () => _sendShortcut('Alt+Tab', 'Alt+Tab')),
      ];

  List<Widget> _functionKeyChips() => List.generate(
        12,
        (index) => ShortcutKeyButton(
          width: 64,
          label: 'F${index + 1}',
          onTap: () => _sendKey('F${index + 1}'),
        ),
      );

  void _sendKey(String key) {
    _sendControlCommand('key', {'key': key, 'state': 'pressed'}, '$key sent');
  }

  void _sendShortcut(String label, String shortcut) {
    _sendControlCommand('shortcut', {'label': label, 'shortcut': shortcut},
        '$label ($shortcut) sent');
  }

  bool _sendControlCommand(
      String command, Map<String, dynamic> details, String successMessage) {
    if (!state.sendCommandLog(command, details)) {
      final message = state.isConnected
          ? 'Connection lost. Reconnect to PC.'
          : 'Connect to PC first';
      state.addLog(message);
      _showFeedback(message);
      return false;
    }
    return true;
  }

  void _startTouchpadDrag() {
    if (_touchpadDragActive) return;
    _flushTouchpadMove();
    if (_sendControlCommand(
        'left_button_down', {'source': 'touchpad_hold'}, 'Drag started')) {
      _touchpadDragActive = true;
      state.setTransientAction('Dragging');
    }
  }

  void _stopTouchpadDrag() {
    if (!_touchpadDragActive) return;
    _flushTouchpadMove();
    _touchpadDragActive = false;
    if (_sendControlCommand(
        'left_button_up', {'source': 'touchpad_hold'}, 'Drag released')) {
      state.setTransientAction('Drag released');
    }
  }

  void _queueTouchpadMove(Offset delta) {
    if (!state.isConnected) {
      state.setTransientAction('Connect to PC first');
      return;
    }
    final sensitivity = (state.mouseSensitivity.value / 50.0).clamp(0.5, 2.0);
    _touchpadDx += delta.dx * sensitivity;
    _touchpadDy += delta.dy * sensitivity;
    _touchpadMoveTimer ??=
        Timer(const Duration(milliseconds: 16), _flushTouchpadMove);
  }

  void _flushTouchpadMove() {
    _touchpadMoveTimer?.cancel();
    _touchpadMoveTimer = null;
    if (!state.isConnected) {
      _touchpadDx = 0;
      _touchpadDy = 0;
      return;
    }
    final dx = _touchpadDx;
    final dy = _touchpadDy;
    _touchpadDx = 0;
    _touchpadDy = 0;
    if (dx.abs() < 0.1 && dy.abs() < 0.1) return;
    if (!state.sendCommandLog('touchpad_move', {'dx': dx, 'dy': dy})) {
      final message = state.isConnected
          ? 'Connection lost. Reconnect to PC.'
          : 'Connect to PC first';
      state.setTransientAction(message);
      _showFeedback(message);
    }
  }
}

class _StatusHeaderCard extends StatelessWidget {
  final AppState state;
  const _StatusHeaderCard({required this.state});

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 8, 12),
      decoration: BoxDecoration(
        color: c.card,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: c.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Connection row rebuilds only on real connection changes.
          ListenableBuilder(
            listenable: state,
            builder: (context, _) {
              final isConnected = state.isConnected;
              return Row(
                children: [
                  Container(
                    width: 8,
                    height: 8,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: isConnected ? c.green : c.textMuted,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          isConnected ? 'Connected' : 'Disconnected',
                          style: TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w600,
                              color: c.textPrimary),
                        ),
                        if (isConnected)
                          Text(state.hostIp,
                              style:
                                  TextStyle(fontSize: 11, color: c.textMuted)),
                      ],
                    ),
                  ),
                  if (isConnected) ...[
                    StatusPill(label: 'LOCAL', color: c.green),
                    const SizedBox(width: 4),
                  ],
                  IconButton(
                    icon: Icon(Icons.power_settings_new,
                        color: isConnected ? c.red : c.textMuted),
                    tooltip: isConnected ? 'Disconnect' : 'Not connected',
                    onPressed: isConnected ? () => state.disconnect() : null,
                  ),
                ],
              );
            },
          ),
          const SizedBox(height: 8),
          // Last-action ticker: the only thing that rebuilds on ordinary taps.
          Row(
            children: [
              Icon(Icons.bolt, size: 13, color: c.green),
              const SizedBox(width: 6),
              Expanded(
                child: ValueListenableBuilder<String>(
                  valueListenable: state.lastAction,
                  builder: (context, message, _) => Text(
                    message,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 11, color: c.textSecondary),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _RemoteScrollBehavior extends ScrollBehavior {
  const _RemoteScrollBehavior();

  @override
  ScrollPhysics getScrollPhysics(BuildContext context) {
    return const ClampingScrollPhysics();
  }

  @override
  Widget buildOverscrollIndicator(
    BuildContext context,
    Widget child,
    ScrollableDetails details,
  ) {
    return child;
  }
}

class _RemoteSectionSwitcher extends StatelessWidget {
  final int selected;
  final ValueChanged<int> onChanged;

  const _RemoteSectionSwitcher({
    required this.selected,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      height: 46,
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: c.card,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: c.border),
      ),
      child: Row(
        children: [
          _RemoteSectionOption(
            label: 'Computer',
            icon: Icons.computer_outlined,
            isSelected: selected == 0,
            onTap: () => onChanged(0),
          ),
          const SizedBox(width: 4),
          _RemoteSectionOption(
            label: 'Phone',
            icon: Icons.screen_share_outlined,
            isSelected: selected == 1,
            onTap: () => onChanged(1),
          ),
        ],
      ),
    );
  }
}

class _RemoteSectionOption extends StatelessWidget {
  final String label;
  final IconData icon;
  final bool isSelected;
  final VoidCallback onTap;

  const _RemoteSectionOption({
    required this.label,
    required this.icon,
    required this.isSelected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Expanded(
      child: Material(
        color: isSelected ? c.blue.withValues(alpha: 0.14) : Colors.transparent,
        borderRadius: BorderRadius.circular(9),
        child: InkWell(
          borderRadius: BorderRadius.circular(9),
          onTap: onTap,
          child: Center(
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  icon,
                  size: 15,
                  color: isSelected ? c.blue : c.textMuted,
                ),
                const SizedBox(width: 6),
                Flexible(
                  child: Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: isSelected ? c.textPrimary : c.textSecondary,
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ShareDiagnosticItem extends StatelessWidget {
  final String label;
  final String value;

  const _ShareDiagnosticItem({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label.toUpperCase(),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            color: c.textMuted,
            fontSize: 9,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          value,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            color: c.textPrimary,
            fontSize: 11,
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
    );
  }
}

class _MobileShareToggleButton extends StatelessWidget {
  final String label;
  final bool isSharing;
  final bool isEnabled;
  final VoidCallback onTap;

  const _MobileShareToggleButton({
    required this.label,
    required this.isSharing,
    required this.isEnabled,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Material(
      color: isSharing
          ? c.red.withValues(alpha: 0.14)
          : isEnabled
              ? c.blue.withValues(alpha: 0.14)
              : c.card.withValues(alpha: 0.72),
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: isEnabled ? onTap : null,
        child: Container(
          height: 44,
          padding: const EdgeInsets.symmetric(horizontal: 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: isSharing
                  ? c.red.withValues(alpha: 0.65)
                  : isEnabled
                      ? c.blue.withValues(alpha: 0.65)
                      : c.border,
            ),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                isSharing ? Icons.stop_rounded : Icons.play_arrow_rounded,
                size: 18,
                color: isSharing
                    ? c.red
                    : isEnabled
                        ? c.blue
                        : c.textMuted,
              ),
              const SizedBox(width: 8),
              Flexible(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: c.textPrimary,
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _FullscreenPreviewButton extends StatelessWidget {
  final VoidCallback onTap;
  final bool overlay;

  const _FullscreenPreviewButton({
    required this.onTap,
    this.overlay = false,
  });

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final size = overlay ? 34.0 : 44.0;
    final radius = overlay ? 8.0 : 10.0;
    return Tooltip(
      message: 'Fullscreen Preview',
      child: Material(
        color: overlay ? c.card.withValues(alpha: 0.88) : c.card,
        borderRadius: BorderRadius.circular(radius),
        child: InkWell(
          borderRadius: BorderRadius.circular(radius),
          onTap: onTap,
          child: Container(
            width: size,
            height: size,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(radius),
              border: Border.all(
                color: overlay ? c.border.withValues(alpha: 0.82) : c.border,
              ),
            ),
            child: Icon(
              Icons.open_in_full_rounded,
              size: overlay ? 16 : 18,
              color: c.blue,
            ),
          ),
        ),
      ),
    );
  }
}

class _PreviewToggleButton extends StatelessWidget {
  final bool isStreaming;
  final bool isEnabled;
  final String? label;
  final VoidCallback onTap;

  const _PreviewToggleButton({
    required this.isStreaming,
    required this.isEnabled,
    required this.onTap,
    this.label,
  });

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return SizedBox(
      width: 116,
      height: 44,
      child: Material(
        color: isStreaming
            ? c.red.withValues(alpha: 0.14)
            : isEnabled
                ? c.card.withValues(alpha: 0.96)
                : c.card.withValues(alpha: 0.72),
        borderRadius: BorderRadius.circular(10),
        child: InkWell(
          borderRadius: BorderRadius.circular(10),
          onTap: isEnabled ? onTap : null,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                color: isStreaming
                    ? c.red.withValues(alpha: 0.65)
                    : isEnabled
                        ? c.border
                        : c.border.withValues(alpha: 0.65),
              ),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  isStreaming ? Icons.stop_rounded : Icons.play_arrow_rounded,
                  size: 18,
                  color: isStreaming
                      ? c.red
                      : isEnabled
                          ? c.blue
                          : c.textMuted,
                ),
                const SizedBox(width: 6),
                Flexible(
                  child: Text(
                    label ?? (isStreaming ? 'Stop Preview' : 'Start Preview'),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: c.textPrimary,
                      fontSize: 10.5,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _CompactMonitorButton extends StatelessWidget {
  final String label;
  final bool isActive;
  final VoidCallback onTap;

  const _CompactMonitorButton({
    required this.label,
    required this.isActive,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return SizedBox(
      width: 46,
      height: 44,
      child: Material(
        color: isActive ? c.blue.withValues(alpha: 0.10) : c.card,
        borderRadius: BorderRadius.circular(10),
        child: InkWell(
          borderRadius: BorderRadius.circular(10),
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 6),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: isActive ? c.blue : c.border),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  Icons.monitor_outlined,
                  size: 15,
                  color: isActive ? c.blue : c.textMuted,
                ),
                const SizedBox(width: 4),
                Flexible(
                  child: Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: isActive ? c.textPrimary : c.textSecondary,
                      fontWeight: isActive ? FontWeight.w700 : FontWeight.w500,
                      fontSize: 12,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _PreviewControlsHint extends StatelessWidget {
  final String message;

  const _PreviewControlsHint({required this.message});

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      height: 44,
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(
        color: c.card,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: c.border),
      ),
      child: Row(
        children: [
          Icon(Icons.monitor_outlined, size: 15, color: c.textMuted),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              message,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 11, color: c.textMuted),
            ),
          ),
        ],
      ),
    );
  }
}

class _ToolTabBar extends StatelessWidget {
  final int selected;
  final int heldCount;
  final ValueChanged<int> onSelect;

  const _ToolTabBar({
    required this.selected,
    required this.heldCount,
    required this.onSelect,
  });

  @override
  Widget build(BuildContext context) {
    final c = context.colors;

    Widget segment(int index, String label, IconData icon,
        {bool showDot = false}) {
      final isActive = selected == index;
      return Expanded(
        child: Material(
          color: isActive ? c.blue.withValues(alpha: 0.12) : Colors.transparent,
          borderRadius: BorderRadius.circular(8),
          child: InkWell(
            borderRadius: BorderRadius.circular(8),
            onTap: () => onSelect(index),
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 8),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(8),
                border:
                    Border.all(color: isActive ? c.blue : Colors.transparent),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(icon, size: 14, color: isActive ? c.blue : c.textMuted),
                  const SizedBox(width: 6),
                  Flexible(
                    child: Text(
                      label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight:
                            isActive ? FontWeight.w700 : FontWeight.w500,
                        color: isActive ? c.textPrimary : c.textSecondary,
                      ),
                    ),
                  ),
                  if (showDot) ...[
                    const SizedBox(width: 4),
                    Container(
                      width: 6,
                      height: 6,
                      decoration:
                          BoxDecoration(shape: BoxShape.circle, color: c.blue),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: c.card,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: c.border),
      ),
      child: Row(
        children: [
          segment(0, 'Mouse', Icons.mouse_outlined),
          segment(1, 'Keyboard', Icons.keyboard_alt_outlined),
          segment(2, 'Shortcuts', Icons.bolt_outlined, showDot: heldCount > 0),
        ],
      ),
    );
  }
}

class _ShortcutGroup extends StatelessWidget {
  final String title;
  final IconData icon;
  final String? badge;
  final bool expanded;
  final VoidCallback? onToggle;
  final List<Widget> children;

  const _ShortcutGroup({
    required this.title,
    required this.icon,
    this.badge,
    required this.expanded,
    this.onToggle,
    required this.children,
  });

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      decoration: BoxDecoration(
        color: c.card,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: c.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _buildHeader(context, c),
          if (expanded)
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
              child: Wrap(spacing: 6, runSpacing: 6, children: children),
            ),
        ],
      ),
    );
  }

  Widget _buildHeader(BuildContext context, AppColors c) {
    final header = Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Row(
        children: [
          Icon(icon, size: 16, color: c.textMuted),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              title,
              style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: c.textPrimary),
            ),
          ),
          _BadgeSlot(label: badge, color: c.blue),
          if (onToggle != null) ...[
            const SizedBox(width: 8),
            AnimatedRotation(
              turns: expanded ? 0.5 : 0,
              duration: const Duration(milliseconds: 180),
              child:
                  Icon(Icons.keyboard_arrow_down, size: 18, color: c.textMuted),
            ),
          ],
        ],
      ),
    );
    if (onToggle == null) return header;
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: onToggle,
      child: header,
    );
  }
}

class _BadgeSlot extends StatelessWidget {
  final String? label;
  final Color color;

  const _BadgeSlot({required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 58,
      height: 24,
      child: Align(
        alignment: Alignment.centerRight,
        child: AnimatedOpacity(
          opacity: label == null ? 0 : 1,
          duration: const Duration(milliseconds: 120),
          child: StatusPill(label: label ?? '0 HELD', color: color),
        ),
      ),
    );
  }
}

class _MouseButton extends StatelessWidget {
  final String label;
  final Widget icon;
  final VoidCallback onTap;
  const _MouseButton(
      {required this.label, required this.icon, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Expanded(
      child: Material(
        color: c.card,
        borderRadius: BorderRadius.circular(10),
        child: InkWell(
          borderRadius: BorderRadius.circular(10),
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 10),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: c.border),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                SizedBox(height: 20, child: Center(child: icon)),
                const SizedBox(height: 4),
                Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      color: c.textMuted),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
