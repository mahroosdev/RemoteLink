import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// Renders one pill per detected monitor (data-driven, supports 1..3+).
class MonitorSelector extends StatelessWidget {
  final int monitorCount;
  final List<String> labels;
  final int activeMonitor;
  final Function(int) onMonitorChanged;

  const MonitorSelector({
    super.key,
    required this.monitorCount,
    this.labels = const [],
    required this.activeMonitor,
    required this.onMonitorChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        for (var id = 1; id <= monitorCount; id++) ...[
          if (id > 1) const SizedBox(width: 12),
          _MonitorButton(
            label: id <= labels.length ? labels[id - 1] : 'Screen $id',
            isActive: activeMonitor == id,
            onTap: () => onMonitorChanged(id),
          ),
        ],
      ],
    );
  }
}

class _MonitorButton extends StatelessWidget {
  final String label;
  final bool isActive;
  final VoidCallback onTap;

  const _MonitorButton({
    required this.label,
    required this.isActive,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 12),
          decoration: BoxDecoration(
            color: isActive ? c.blue.withValues(alpha: 0.1) : c.card,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: isActive ? c.blue : c.border,
            ),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.monitor, size: 16, color: isActive ? c.blue : c.textMuted),
              const SizedBox(width: 8),
              Text(
                label,
                style: TextStyle(
                  color: isActive ? c.textPrimary : c.textSecondary,
                  fontWeight: isActive ? FontWeight.w600 : FontWeight.w400,
                  fontSize: 13,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
