import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import '../widgets/status_pill.dart';
import '../widgets/monitor_selector.dart';
import '../widgets/shortcut_key_button.dart';
import '../widgets/touchpad_area.dart';
import '../widgets/screen_preview.dart';
import '../widgets/mouse_click_icon.dart';
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

  // Portrait accordions may have several groups open at once.
  final Set<String> _expandedGroups = {'Basic Keys'};
  int _toolTab = 0; // 0 = Mouse, 1 = Keyboard, 2 = Shortcuts

  AppState get state => widget.state;

  @override
  void dispose() {
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
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(message),
          behavior: SnackBarBehavior.floating,
          duration: const Duration(milliseconds: 900),
        ),
      );
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
    return SingleChildScrollView(
      child: Center(
        child: ConstrainedBox(
          // Preview, touchpad and all controls share one controlled width.
          constraints: const BoxConstraints(maxWidth: 480),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _StatusHeaderCard(state: state),
                const SizedBox(height: 12),
                _FullscreenPreviewButton(onTap: _openFullscreen),
                const SizedBox(height: 12),
                _buildPreviewBlock(context),
                const SizedBox(height: 12),
                _buildToolTabBar(),
                const SizedBox(height: 12),
                _buildToolTabContent(context),
              ],
            ),
          ),
        ),
      ),
    );
  }

  // ------------------------------------------------------------ shared parts

  Widget _buildPreviewBlock(BuildContext context) {
    return ListenableBuilder(
      listenable: state,
      builder: (context, _) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Stack(
            children: [
              ScreenPreview(
                isConnected: state.isConnected,
                activeMonitor: state.activeMonitor,
              ),
            ],
          ),
          const SizedBox(height: 12),
          _buildMonitorArea(context),
        ],
      ),
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
        _buildTouchpad(height: 150),
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

  Widget _buildMonitorArea(BuildContext context) {
    final c = context.colors;
    if (state.isConnected && state.detectedMonitorCount > 0) {
      return MonitorSelector(
        monitorCount: state.detectedMonitorCount,
        activeMonitor: state.activeMonitor,
        labels: state.detectedMonitors
            .map((monitor) => monitor.label)
            .toList(growable: false),
        onMonitorChanged: (id) {
          final wasSelected = state.activeMonitor == id;
          state.setActiveMonitor(id);
          if (!state.isConnected) {
            _showFeedback('Connect to PC first');
          } else if (!wasSelected && state.activeMonitor != id) {
            _showFeedback('Screen selection failed');
          }
        },
      );
    }
    final message = state.isConnected
        ? 'No desktop screens detected'
        : 'Connect to PC to load screens';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: c.card,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: c.border),
      ),
      child: Row(
        children: [
          Icon(Icons.monitor_outlined, size: 16, color: c.textMuted),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message,
              style: TextStyle(fontSize: 12, color: c.textMuted),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTouchpad({required double height}) {
    return ValueListenableBuilder<bool>(
      valueListenable: state.showTouchpadPointer,
      builder: (context, showPointer, _) => TouchpadArea(
        height: height,
        showPointer: showPointer,
        onMove: (delta) {
          if (state.isConnected) {
            state.sendCommandLog(
                'touchpad_move', {'dx': delta.dx, 'dy': delta.dy});
          } else {
            state.setTransientAction('Connect to PC first');
          }
        },
        onMoveEnd: () {
          if (state.isConnected) {
            state.addLog('Pointer moved', updateTicker: false);
          }
        },
        onTap: () {
          _sendControlCommand(
              'left_click', {'source': 'touchpad_tap'}, 'Left click sent');
        },
        onDoubleTap: () {
          _sendControlCommand('left_click', {'clicks': 2}, 'Double click sent');
        },
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
    state.addLog(successMessage, updateTicker: false);
    return true;
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
                    StatusPill(label: '12ms', color: c.green),
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

class _FullscreenPreviewButton extends StatelessWidget {
  final VoidCallback onTap;

  const _FullscreenPreviewButton({required this.onTap});

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Material(
      color: c.card,
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: c.border),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.screen_rotation, size: 16, color: c.blue),
              const SizedBox(width: 8),
              Text(
                'Fullscreen Preview',
                style: TextStyle(
                  color: c.textPrimary,
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
        ),
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
