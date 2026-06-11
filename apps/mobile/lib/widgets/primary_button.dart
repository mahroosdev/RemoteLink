import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

class PrimaryButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  final bool isDanger;

  const PrimaryButton({
    super.key,
    required this.label,
    this.onPressed,
    this.isDanger = false,
  });

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return SizedBox(
      width: double.infinity,
      height: 50,
      child: ElevatedButton(
        onPressed: onPressed,
        style: ElevatedButton.styleFrom(
          backgroundColor: isDanger ? c.red.withValues(alpha: 0.1) : c.textPrimary,
          foregroundColor: isDanger ? c.red : c.background,
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
            side: isDanger ? BorderSide(color: c.red, width: 0.5) : BorderSide.none,
          ),
          textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
        ),
        child: Text(label),
      ),
    );
  }
}
