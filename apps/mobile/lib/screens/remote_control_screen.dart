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

/// Layout is chosen manually via [AppState.remoteLayoutMode] — never by the
/// device/browser orientation. Listeners are scoped to the smallest widgets
/// (ticker, header, preview, modifier groups) so ordinary control taps never
/// rebuild the screen — that full-screen rebuild was the tap "flash".
class RemoteControlScreen extends StatefulWidget {
  final AppState state;
  const RemoteControlScreen({super.key, required this.state});

  @override
  State<RemoteControlScreen> createState() => _RemoteControlScreenState();
}

class _RemoteControlScreenState extends State<RemoteControlScreen> {
  final _textController = TextEditingController();

  // Portrait accordions may have several groups open at once.
  // All of this survives tab switches because IndexedStack keeps State alive.
  final Set<String> _expandedGroups = {'Basic Keys'};

  // Landscape controls: segmented tool tabs + single-expansion accordion.
  int _toolTab = 0; // 0 = Mouse, 1 = Keyboard, 2 = Shortcuts
  String? _landscapeExpandedGroup = 'Modifiers';

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
    state.addLog('Sent text: $text');
    _textController.clear();
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
        child: ValueListenableBuilder<String>(
          valueListenable: state.remoteLayoutMode,
          builder: (context, mode, _) =>
              mode == 'landscape' ? _buildLandscape(context, mode) : _buildPortrait(context, mode),
        ),
      ),
    );
  }

  // ---------------------------------------------------------------- portrait

  Widget _buildPortrait(BuildContext context, String mode) {
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
                const SizedBox(height: 8),
                _LayoutToggleButton(mode: mode, onTap: state.toggleRemoteLayout),
                const SizedBox(height: 12),

                _buildPreviewBlock(context),
                const SizedBox(height: 16),

                _buildTouchpad(height: 150),
                const SizedBox(height: 12),

                ..._buildMouseGrid(context),
                const SizedBox(height: 16),

                _buildTypingBar(context),
                const SizedBox(height: 16),

                _ShortcutGroup(
                  title: 'Basic Keys',
                  icon: Icons.keyboard_outlined,
                  expanded: _expandedGroups.contains('Basic Keys'),
                  onToggle: () => _toggleGroup('Basic Keys'),
                  children: _basicKeyChips(),
                ),
                const SizedBox(height: 8),
                // Held-modifier styling depends on interaction state.
                ListenableBuilder(
                  listenable: state,
                  builder: (context, _) => _ShortcutGroup(
                    title: 'Modifiers',
                    icon: Icons.keyboard_command_key,
                    badge: state.heldModifiers.isEmpty ? null : '${state.heldModifiers.length} held',
                    expanded: _expandedGroups.contains('Modifiers'),
                    onToggle: () => _toggleGroup('Modifiers'),
                    children: _modifierChips(),
                  ),
                ),
                const SizedBox(height: 8),
                _ShortcutGroup(
                  title: 'Actions',
                  icon: Icons.flash_on_outlined,
                  expanded: _expandedGroups.contains('Actions'),
                  onToggle: () => _toggleGroup('Actions'),
                  children: _actionChips(),
                ),
                const SizedBox(height: 8),
                ListenableBuilder(
                  listenable: state,
                  builder: (context, _) => _ShortcutGroup(
                    title: 'Function Keys',
                    icon: Icons.functions,
                    expanded: state.showFunctionKeys,
                    onToggle: state.toggleFunctionKeys,
                    children: _functionKeyChips(),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  // --------------------------------------------------------------- landscape

  Widget _buildLandscape(BuildContext context, String mode) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final wide = constraints.maxWidth >= 600;
        if (wide) {
          return Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Main view: status + large preview + monitor selection.
              Expanded(
                flex: 3,
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(12, 10, 6, 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      _StatusHeaderCard(state: state),
                      const SizedBox(height: 8),
                      _LayoutToggleButton(mode: mode, onTap: state.toggleRemoteLayout),
                      const SizedBox(height: 10),
                      _buildPreviewBlock(context),
                    ],
                  ),
                ),
              ),
              // Controls: segmented tool tabs, one tool group at a time.
              Expanded(
                flex: 2,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(6, 10, 12, 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      _buildToolTabBar(),
                      const SizedBox(height: 8),
                      Expanded(
                        child: SingleChildScrollView(
                          child: _buildToolTabContent(context),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          );
        }
        // Narrow screen, landscape controls: same tabbed tools, stacked.
        return SingleChildScrollView(
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 480),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    _StatusHeaderCard(state: state),
                    const SizedBox(height: 8),
                    _LayoutToggleButton(mode: mode, onTap: state.toggleRemoteLayout),
                    const SizedBox(height: 12),
                    _buildPreviewBlock(context),
                    const SizedBox(height: 16),
                    _buildToolTabBar(),
                    const SizedBox(height: 8),
                    _buildToolTabContent(context),
                  ],
                ),
              ),
            ),
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
        onSelect: (i) => setState(() => _toolTab = i),
      ),
    );
  }

  Widget _buildToolTabContent(BuildContext context) {
    final c = context.colors;
    switch (_toolTab) {
      case 1: // Keyboard
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _buildTypingBar(context),
            const SizedBox(height: 12),
            Text('BASIC KEYS',
                style: TextStyle(color: c.textMuted, fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 1.5)),
            const SizedBox(height: 8),
            Wrap(spacing: 6, runSpacing: 6, children: _basicKeyChips()),
          ],
        );
      case 2: // Shortcuts — one group expanded at a time in limited height.
        return ListenableBuilder(
          listenable: state,
          builder: (context, _) {
            Widget group(String title, IconData icon, List<Widget> children, {String? badge}) => _ShortcutGroup(
                  title: title,
                  icon: icon,
                  badge: badge,
                  expanded: _landscapeExpandedGroup == title,
                  onToggle: () => setState(() {
                    _landscapeExpandedGroup = _landscapeExpandedGroup == title ? null : title;
                  }),
                  children: children,
                );
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                group('Modifiers', Icons.keyboard_command_key, _modifierChips(),
                    badge: state.heldModifiers.isEmpty ? null : '${state.heldModifiers.length} held'),
                const SizedBox(height: 8),
                group('Actions', Icons.flash_on_outlined, _actionChips()),
                const SizedBox(height: 8),
                group('Function Keys', Icons.functions, _functionKeyChips()),
              ],
            );
          },
        );
      case 0: // Mouse
      default:
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _buildTouchpad(height: 140),
            const SizedBox(height: 8),
            ..._buildMouseGrid(context),
          ],
        );
    }
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
              Positioned(
                bottom: 8,
                right: 8,
                child: Container(
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.08),
                    shape: BoxShape.circle,
                    border: Border.all(color: Colors.white.withValues(alpha: 0.15)),
                  ),
                  child: IconButton(
                    visualDensity: VisualDensity.compact,
                    icon: Icon(Icons.fullscreen, size: 20, color: Colors.white.withValues(alpha: 0.8)),
                    tooltip: 'Fullscreen preview',
                    onPressed: _openFullscreen,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          _buildMonitorArea(context),
        ],
      ),
    );
  }

  Widget _buildMonitorArea(BuildContext context) {
    final c = context.colors;
    if (state.isConnected && state.detectedMonitorCount > 0) {
      return MonitorSelector(
        monitorCount: state.detectedMonitorCount,
        activeMonitor: state.activeMonitor,
        onMonitorChanged: state.setActiveMonitor,
      );
    }
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
              'Connect to PC to detect available screens.',
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
        onMove: (_) => state.setTransientAction('Pointer moving...'),
        onMoveEnd: () => state.addLog('Pointer moved'),
        onTap: () => state.addLog('Left Click (tap)'),
        onDoubleTap: () => state.addLog('Double Click'),
        onLongPress: () => state.addLog('Long Press'),
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
            icon: MouseClickIcon(outline: c.textSecondary, highlight: c.textPrimary),
            onTap: () => state.addLog('Left click sent'),
          ),
          const SizedBox(width: 8),
          _MouseButton(
            label: 'Right Click',
            icon: MouseClickIcon(right: true, outline: c.textSecondary, highlight: c.textPrimary),
            onTap: () => state.addLog('Right click sent'),
          ),
        ],
      ),
      const SizedBox(height: 8),
      Row(
        children: [
          _MouseButton(
            label: 'Scroll Up',
            icon: Icon(Icons.keyboard_arrow_up, size: 18, color: c.textSecondary),
            onTap: () => state.addLog('Scroll up'),
          ),
          const SizedBox(width: 8),
          _MouseButton(
            label: 'Scroll Down',
            icon: Icon(Icons.keyboard_arrow_down, size: 18, color: c.textSecondary),
            onTap: () => state.addLog('Scroll down'),
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
              contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(30)),
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
        ShortcutKeyButton(label: 'Esc', onTap: () => state.addLog('Esc pressed')),
        ShortcutKeyButton(label: 'Tab', onTap: () => state.addLog('Tab pressed')),
        ShortcutKeyButton(label: 'Enter', onTap: () => state.addLog('Enter pressed')),
        ShortcutKeyButton(label: 'Del', onTap: () => state.addLog('Del pressed')),
      ];

  List<Widget> _modifierChips() => [
        for (final key in const ['Ctrl', 'Alt', 'Shift', 'Win'])
          ShortcutKeyButton(
            label: key,
            isHeld: state.heldModifiers.contains(key),
            onTap: () => state.toggleModifier(key),
          ),
        ShortcutKeyButton(
          label: 'Release All Keys',
          isDanger: true,
          onTap: () => state.releaseAllKeys(),
        ),
      ];

  List<Widget> _actionChips() => [
        ShortcutKeyButton(label: 'Cut', onTap: () => state.addLog('Cut (Ctrl+X) sent')),
        ShortcutKeyButton(label: 'Copy', onTap: () => state.addLog('Copy (Ctrl+C) sent')),
        ShortcutKeyButton(label: 'Paste', onTap: () => state.addLog('Paste (Ctrl+V) sent')),
        ShortcutKeyButton(label: 'Alt+Tab', onTap: () => state.addLog('Alt+Tab sent')),
      ];

  List<Widget> _functionKeyChips() => List.generate(
        12,
        (index) => ShortcutKeyButton(
          width: 64,
          label: 'F${index + 1}',
          onTap: () => state.addLog('F${index + 1} pressed'),
        ),
      );
}

/// Manual layout switch: "Landscape Controls" in portrait mode and
/// "Portrait Controls" in landscape mode.
class _LayoutToggleButton extends StatelessWidget {
  final String mode;
  final VoidCallback onTap;

  const _LayoutToggleButton({required this.mode, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final label = mode == 'portrait' ? 'Landscape Controls' : 'Portrait Controls';
    return InkWell(
      borderRadius: BorderRadius.circular(10),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: c.card,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: c.border),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.screen_rotation, size: 15, color: c.blue),
            const SizedBox(width: 8),
            Text(
              label,
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: c.textPrimary),
            ),
          ],
        ),
      ),
    );
  }
}

class _ToolTabBar extends StatelessWidget {
  final int selected;
  final int heldCount;
  final ValueChanged<int> onSelect;

  const _ToolTabBar({required this.selected, required this.heldCount, required this.onSelect});

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    Widget segment(int index, String label, IconData icon, {bool showDot = false}) {
      final isActive = selected == index;
      return Expanded(
        child: GestureDetector(
          onTap: () => onSelect(index),
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 8),
            decoration: BoxDecoration(
              color: isActive ? c.blue.withValues(alpha: 0.12) : Colors.transparent,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: isActive ? c.blue : Colors.transparent),
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
                      fontWeight: isActive ? FontWeight.w700 : FontWeight.w500,
                      color: isActive ? c.textPrimary : c.textSecondary,
                    ),
                  ),
                ),
                if (showDot) ...[
                  const SizedBox(width: 4),
                  Container(
                    width: 6,
                    height: 6,
                    decoration: BoxDecoration(shape: BoxShape.circle, color: c.blue),
                  ),
                ],
              ],
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
                          style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.textPrimary),
                        ),
                        if (isConnected)
                          Text(state.hostIp, style: TextStyle(fontSize: 11, color: c.textMuted)),
                      ],
                    ),
                  ),
                  if (isConnected) ...[
                    StatusPill(label: '12ms', color: c.green),
                    const SizedBox(width: 4),
                  ],
                  IconButton(
                    icon: Icon(Icons.power_settings_new, color: isConnected ? c.red : c.textMuted),
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

class _ShortcutGroup extends StatelessWidget {
  final String title;
  final IconData icon;
  final String? badge;
  final bool expanded;
  final VoidCallback onToggle;
  final List<Widget> children;

  const _ShortcutGroup({
    required this.title,
    required this.icon,
    this.badge,
    required this.expanded,
    required this.onToggle,
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
          InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: onToggle,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              child: Row(
                children: [
                  Icon(icon, size: 16, color: c.textMuted),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      title,
                      style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: c.textPrimary),
                    ),
                  ),
                  if (badge != null) ...[
                    StatusPill(label: badge!, color: c.blue),
                    const SizedBox(width: 8),
                  ],
                  AnimatedRotation(
                    turns: expanded ? 0.5 : 0,
                    duration: const Duration(milliseconds: 180),
                    child: Icon(Icons.keyboard_arrow_down, size: 18, color: c.textMuted),
                  ),
                ],
              ),
            ),
          ),
          if (expanded)
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
              child: Wrap(spacing: 6, runSpacing: 6, children: children),
            ),
        ],
      ),
    );
  }
}

class _MouseButton extends StatelessWidget {
  final String label;
  final Widget icon;
  final VoidCallback onTap;
  const _MouseButton({required this.label, required this.icon, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            color: c.card,
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
                style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: c.textMuted),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
