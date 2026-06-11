import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

class ShortcutKeyButton extends StatelessWidget {
  final String label;
  final bool isHeld;
  final bool isDanger;
  final VoidCallback onTap;
  final double? width;

  const ShortcutKeyButton({
    super.key,
    required this.label,
    this.isHeld = false,
    this.isDanger = false,
    required this.onTap,
    this.width,
  });

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final Color background = isHeld ? c.blue : (isDanger ? c.red.withValues(alpha: 0.1) : c.elevatedCard);
    final Color borderColor = isHeld ? c.blue : (isDanger ? c.red.withValues(alpha: 0.5) : c.border);
    final Color textColor = isHeld ? Colors.white : (isDanger ? c.red : c.textSecondary);

    return SizedBox(
      width: width,
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            color: background,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: borderColor),
          ),
          // Center only fixed-width chips; unconstrained ones must shrink-wrap
          // inside Wrap instead of expanding to the full row.
          alignment: width != null ? Alignment.center : null,
          child: Text(
            label,
            style: TextStyle(
              color: textColor,
              fontWeight: FontWeight.w600,
              fontSize: 12,
            ),
          ),
        ),
      ),
    );
  }
}
