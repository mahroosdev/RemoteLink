import 'package:flutter/material.dart';

class AppLogo extends StatelessWidget {
  final double size;
  const AppLogo({super.key, this.size = 48});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    
    // Theme-specific logo tile behavior:
    // Dark mode => white tile + dark icon
    // Light mode => black tile + white icon
    final tileColor = isDark ? Colors.white : const Color(0xFF0F1115);
    final markColor = isDark ? const Color(0xFF0F1115) : Colors.white;

    return SizedBox(
      width: size,
      height: size,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: tileColor,
          borderRadius: BorderRadius.circular(size * 0.22),
        ),
        child: Padding(
          padding: EdgeInsets.all(size * 0.20),
          child: CustomPaint(
            painter: _AppLogoPainter(
              markColor: markColor,
            ),
          ),
        ),
      ),
    );
  }
}

class _AppLogoPainter extends CustomPainter {
  final Color markColor;

  const _AppLogoPainter({
    required this.markColor,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = markColor
      ..style = PaintingStyle.fill
      ..isAntiAlias = true;

    // Background knockout paint (tile color)
    final knockoutPaint = Paint()
      ..color = (markColor == Colors.white) ? const Color(0xFF0F1115) : Colors.white
      ..style = PaintingStyle.fill;

    // Monitor dimensions (centered slightly higher)
    final mw = size.width * 0.85;
    final mh = size.height * 0.58;
    final mx = (size.width - mw) / 2;
    final my = size.height * 0.08;

    // Monitor main body (Solid Fill)
    final monitorRect = RRect.fromRectAndRadius(
      Rect.fromLTWH(mx, my, mw, mh),
      Radius.circular(size.width * 0.08),
    );
    canvas.drawRRect(monitorRect, paint);

    // Monitor screen cutout (Creating a bezel effect)
    final mBezel = size.width * 0.06;
    final monitorScreenRect = RRect.fromRectAndRadius(
      Rect.fromLTWH(mx + mBezel, my + mBezel, mw - mBezel * 2, mh - mBezel * 2.2),
      Radius.circular(size.width * 0.04),
    );
    canvas.drawRRect(monitorScreenRect, knockoutPaint);

    // Monitor stand/neck
    final neckW = size.width * 0.12;
    final neckH = size.height * 0.10;
    canvas.drawRect(
      Rect.fromLTWH((size.width - neckW) / 2, my + mh - 2, neckW, neckH + 2),
      paint,
    );

    // Monitor base
    final baseW = size.width * 0.35;
    final baseH = size.height * 0.06;
    final baseRect = RRect.fromRectAndRadius(
      Rect.fromLTWH((size.width - baseW) / 2, my + mh + neckH - 1, baseW, baseH),
      Radius.circular(size.width * 0.04),
    );
    canvas.drawRRect(baseRect, paint);

    // Phone (sits at lower right, overlapping monitor slightly)
    final pw = size.width * 0.30;
    final ph = size.height * 0.52;
    final px = size.width * 0.68;
    final py = size.height * 0.40;

    // Phone outer (knockout effect using tile color to clear monitor)
    final phoneKnockout = RRect.fromRectAndRadius(
      Rect.fromLTWH(px - 2, py - 2, pw + 4, ph + 4),
      Radius.circular(size.width * 0.08),
    );
    canvas.drawRRect(phoneKnockout, knockoutPaint);

    // Phone body (Solid Fill)
    final phoneRect = RRect.fromRectAndRadius(
      Rect.fromLTWH(px, py, pw, ph),
      Radius.circular(size.width * 0.06),
    );
    canvas.drawRRect(phoneRect, paint);

    // Phone screen cutout (Creating a bezel effect)
    final pBezel = size.width * 0.05;
    final phoneScreenRect = RRect.fromRectAndRadius(
      Rect.fromLTWH(px + pBezel, py + pBezel, pw - pBezel * 2, ph - pBezel * 3.5),
      Radius.circular(size.width * 0.03),
    );
    canvas.drawRRect(phoneScreenRect, knockoutPaint);
    
    // Phone home button "hole" (Creating a physical button cutout)
    canvas.drawCircle(
      Offset(px + pw / 2, py + ph - pBezel * 1.6),
      size.width * 0.022,
      knockoutPaint,
    );
  }

  @override
  bool shouldRepaint(covariant _AppLogoPainter oldDelegate) {
    return oldDelegate.markColor != markColor;
  }
}
