import 'package:flutter/material.dart';

/// A clean mouse outline with a center divider; the top-left or top-right
/// button is filled to show which click the control sends.
class MouseClickIcon extends StatelessWidget {
  /// false = highlight the left button, true = highlight the right button.
  final bool right;
  final double size;
  final Color outline;
  final Color highlight;

  const MouseClickIcon({
    super.key,
    this.right = false,
    this.size = 20,
    required this.outline,
    required this.highlight,
  });

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      size: Size(size * 0.72, size),
      painter: _MouseClickPainter(right: right, outline: outline, highlight: highlight),
    );
  }
}

class _MouseClickPainter extends CustomPainter {
  final bool right;
  final Color outline;
  final Color highlight;

  _MouseClickPainter({required this.right, required this.outline, required this.highlight});

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    const inset = 0.75; // keep the stroke inside the canvas
    final body = RRect.fromRectAndRadius(
      Rect.fromLTRB(inset, inset, w - inset, h - inset),
      Radius.circular((w - 2 * inset) / 2),
    );
    final bodyPath = Path()..addRRect(body);
    final buttonLine = h * 0.45;

    // Filled top button (left or right half above the button line).
    final fill = Paint()
      ..color = highlight
      ..style = PaintingStyle.fill;
    canvas.save();
    canvas.clipRect(right
        ? Rect.fromLTRB(w / 2, 0, w, buttonLine)
        : Rect.fromLTRB(0, 0, w / 2, buttonLine));
    canvas.drawPath(bodyPath, fill);
    canvas.restore();

    final stroke = Paint()
      ..color = outline
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.4;
    canvas.drawRRect(body, stroke);
    canvas.drawLine(Offset(w / 2, inset), Offset(w / 2, buttonLine), stroke);
    canvas.drawLine(Offset(inset, buttonLine), Offset(w - inset, buttonLine), stroke);
  }

  @override
  bool shouldRepaint(_MouseClickPainter oldDelegate) =>
      oldDelegate.right != right ||
      oldDelegate.outline != outline ||
      oldDelegate.highlight != highlight;
}
