import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import '../models/app_state.dart';

/// Each row listens only to its own ValueNotifier, so changing one setting
/// rebuilds that single row — never the screen, the list, or the app shell.
/// Portrait: single list. Landscape/wide: two-column layout.
class SettingsScreen extends StatelessWidget {
  final AppState state;
  const SettingsScreen({super.key, required this.state});

  List<Widget> _controlsSection() => [
        const _SectionTitle(title: 'Controls'),
        _SliderRow(
          title: 'Mouse Speed',
          notifier: state.mouseSensitivity,
          onChanged: state.setMouseSensitivity,
          onChangeEnd: (v) => state.addLog('Mouse Speed set to ${v.toInt()}'),
        ),
        _ToggleRow(
          title: 'Show Touchpad Pointer',
          description: 'Visible pointer feedback while using the touchpad',
          notifier: state.showTouchpadPointer,
          onChanged: state.setShowTouchpadPointer,
        ),
        _SelectorRow(
          title: 'Pointer Size',
          sheetTitle: 'Pointer Size',
          options: AppState.pointerSizeOptions,
          notifier: state.pointerSize,
          onSelect: state.setPointerSize,
          icon: Icons.near_me_outlined,
        ),
        _SelectorRow(
          title: 'Pointer Design',
          sheetTitle: 'Pointer Design',
          options: AppState.pointerStyleOptions,
          notifier: state.pointerStyle,
          onSelect: state.setPointerStyle,
          icon: Icons.ads_click_outlined,
        ),
      ];

  List<Widget> _interfaceSection() => [
        const _SectionTitle(title: 'Interface'),
        _SelectorRow(
          title: 'App Theme',
          sheetTitle: 'Select Theme',
          options: AppTheme.themeModes,
          notifier: state.themeMode,
          onSelect: state.setThemeMode,
          icon: Icons.palette_outlined,
        ),
      ];

  List<Widget> _statusSection(BuildContext context) => [
        const _SectionTitle(title: 'Connection Status'),
        ListenableBuilder(
          listenable: state,
          builder: (context, _) {
            final connected = state.isConnected;
            final count = state.detectedMonitorCount;
            return _RowShell(
              title: 'Detected Screens',
              description: connected
                  ? (count == 1
                      ? '1 monitor detected'
                      : '$count monitors detected')
                  : 'Connect to PC to load screens',
              trailing: Icon(Icons.monitor_outlined,
                  color: context.colors.textMuted, size: 20),
            );
          },
        ),
      ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Configuration',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
      ),
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            if (constraints.maxWidth >= 720) {
              // Landscape / wide: two readable columns instead of one long list.
              return SingleChildScrollView(
                padding: const EdgeInsets.all(24),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          ..._controlsSection(),
                        ],
                      ),
                    ),
                    const SizedBox(width: 48),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          ..._interfaceSection(),
                          const SizedBox(height: 32),
                          ..._statusSection(context),
                        ],
                      ),
                    ),
                  ],
                ),
              );
            }
            return ListView(
              padding: const EdgeInsets.all(24),
              children: [
                ..._controlsSection(),
                const SizedBox(height: 32),
                ..._interfaceSection(),
                const SizedBox(height: 32),
                ..._statusSection(context),
              ],
            );
          },
        ),
      ),
    );
  }
}

void _showSelectorSheet(
  BuildContext context,
  String title,
  List<String> options,
  String current,
  ValueChanged<String> onSelect,
) {
  final c = context.colors;
  showModalBottomSheet(
    context: context,
    backgroundColor: c.elevatedCard,
    shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
    builder: (sheetContext) => SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(vertical: 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(title,
                style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: c.textPrimary)),
            const SizedBox(height: 16),
            ...options.map((opt) => ListTile(
                  dense: true,
                  title: Text(opt,
                      style: TextStyle(
                          color: opt == current ? c.blue : c.textPrimary)),
                  trailing:
                      opt == current ? Icon(Icons.check, color: c.blue) : null,
                  onTap: () {
                    onSelect(opt);
                    Navigator.pop(sheetContext);
                  },
                )),
          ],
        ),
      ),
    ),
  );
}

class _SectionTitle extends StatelessWidget {
  final String title;
  const _SectionTitle({required this.title});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16.0),
      child: Text(
        title.toUpperCase(),
        style: TextStyle(
            color: context.colors.textMuted,
            fontSize: 11,
            fontWeight: FontWeight.w700,
            letterSpacing: 1.5),
      ),
    );
  }
}

class _RowShell extends StatelessWidget {
  final String title;
  final String description;
  final Widget trailing;
  final VoidCallback? onTap;

  const _RowShell({
    required this.title,
    required this.description,
    required this.trailing,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.only(bottom: 24.0),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                      style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w500,
                          color: c.textPrimary)),
                  const SizedBox(height: 4),
                  Text(description,
                      style: TextStyle(fontSize: 12, color: c.textMuted)),
                ],
              ),
            ),
            trailing,
          ],
        ),
      ),
    );
  }
}

class _ToggleRow extends StatelessWidget {
  final String title;
  final String description;
  final ValueNotifier<bool> notifier;
  final ValueChanged<bool> onChanged;

  const _ToggleRow({
    required this.title,
    required this.description,
    required this.notifier,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<bool>(
      valueListenable: notifier,
      builder: (context, value, _) => _RowShell(
        title: title,
        description: description,
        onTap: () => onChanged(!value),
        trailing: Switch(
          value: value,
          onChanged: onChanged,
          activeThumbColor: context.colors.blue,
        ),
      ),
    );
  }
}

class _SelectorRow extends StatelessWidget {
  final String title;
  final String sheetTitle;
  final List<String> options;
  final ValueNotifier<String> notifier;
  final ValueChanged<String> onSelect;
  final IconData icon;

  const _SelectorRow({
    required this.title,
    required this.sheetTitle,
    required this.options,
    required this.notifier,
    required this.onSelect,
    required this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<String>(
      valueListenable: notifier,
      builder: (context, value, _) => _RowShell(
        title: title,
        description: value,
        onTap: () =>
            _showSelectorSheet(context, sheetTitle, options, value, onSelect),
        trailing: Icon(icon, color: context.colors.textMuted, size: 20),
      ),
    );
  }
}

class _SliderRow extends StatelessWidget {
  final String title;
  final ValueNotifier<double> notifier;
  final ValueChanged<double> onChanged;
  final ValueChanged<double>? onChangeEnd;

  const _SliderRow({
    required this.title,
    required this.notifier,
    required this.onChanged,
    this.onChangeEnd,
  });

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: const EdgeInsets.only(bottom: 20.0),
      child: ValueListenableBuilder<double>(
        valueListenable: notifier,
        builder: (context, value, _) => Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Text(title,
                      style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w500,
                          color: c.textPrimary)),
                ),
                Text(value.toInt().toString(),
                    style: TextStyle(
                        color: c.blue,
                        fontWeight: FontWeight.bold,
                        fontSize: 12)),
              ],
            ),
            Slider(
              value: value,
              min: 1,
              max: 100,
              divisions: 99,
              label: value.toInt().toString(),
              activeColor: c.blue,
              onChanged: onChanged,
              onChangeEnd: onChangeEnd,
            ),
          ],
        ),
      ),
    );
  }
}
