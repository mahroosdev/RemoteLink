import 'dart:math' as math;
import 'dart:typed_data';

import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import '../models/app_state.dart';

class ScreenPreview extends StatefulWidget {
  final bool isConnected;
  final int activeMonitor;
  final String layoutMode;
  final PreviewStreamStatus streamStatus;
  final Uint8List? frameBytes;
  final String? streamError;
  final Offset? cursorPosition;
  final int? frameWidth;
  final int? frameHeight;
  final String pointerSize;
  final String pointerStyle;

  /// If provided, overrides the default aspect ratio.
  final double? aspectRatio;
  final bool fill;

  const ScreenPreview({
    super.key,
    required this.isConnected,
    required this.activeMonitor,
    this.streamStatus = PreviewStreamStatus.stopped,
    this.frameBytes,
    this.streamError,
    this.cursorPosition,
    this.frameWidth,
    this.frameHeight,
    this.pointerSize = 'Tiny',
    this.pointerStyle = 'Classic Arrow',
    this.layoutMode = 'portrait',
    this.aspectRatio,
    this.fill = false,
  });

  @override
  State<ScreenPreview> createState() => _ScreenPreviewState();
}

class _ScreenPreviewState extends State<ScreenPreview> {
  final TransformationController _transformationController =
      TransformationController();

  bool get isConnected => widget.isConnected;
  int get activeMonitor => widget.activeMonitor;
  String get layoutMode => widget.layoutMode;
  PreviewStreamStatus get streamStatus => widget.streamStatus;
  Uint8List? get frameBytes => widget.frameBytes;
  String? get streamError => widget.streamError;
  Offset? get cursorPosition => widget.cursorPosition;
  int? get frameWidth => widget.frameWidth;
  int? get frameHeight => widget.frameHeight;
  String get pointerSize => widget.pointerSize;
  String get pointerStyle => widget.pointerStyle;
  double? get aspectRatio => widget.aspectRatio;
  bool get fill => widget.fill;

  @override
  void didUpdateWidget(covariant ScreenPreview oldWidget) {
    super.didUpdateWidget(oldWidget);
    final shouldReset = oldWidget.activeMonitor != widget.activeMonitor ||
        oldWidget.streamStatus != widget.streamStatus &&
            (widget.streamStatus == PreviewStreamStatus.stopped ||
                widget.streamStatus == PreviewStreamStatus.error) ||
        oldWidget.frameWidth != widget.frameWidth ||
        oldWidget.frameHeight != widget.frameHeight ||
        !widget.isConnected;
    if (shouldReset) _resetZoom();
  }

  @override
  void dispose() {
    _transformationController.dispose();
    super.dispose();
  }

  void _resetZoom() {
    _transformationController.value = Matrix4.identity();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;

    // Visually differentiate the preview canvas based on layout mode.
    final isLandscape = layoutMode == 'landscape';
    final currentAspectRatio = isLandscape ? 16 / 9 : 4 / 3;
    final finalAspectRatio = aspectRatio ?? currentAspectRatio;
    final status = _statusLabel();
    final placeholderContent = Column(
      key: fill ? const ValueKey('fullscreen-preview-placeholder') : null,
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(
          isConnected ? Icons.monitor : Icons.monitor_outlined,
          color: isConnected
              ? c.blue.withValues(alpha: 0.6)
              : Colors.white.withValues(alpha: 0.25),
          size: fill ? 54 : 40,
        ),
        const SizedBox(height: 12),
        Text(
          status,
          maxLines: 1,
          overflow: TextOverflow.fade,
          softWrap: false,
          style: TextStyle(
            color: Colors.white.withValues(alpha: isConnected ? 0.6 : 0.35),
            fontSize: fill ? 12 : 11,
            fontWeight: FontWeight.w600,
            letterSpacing: 0,
          ),
        ),
      ],
    );
    final placeholder = Center(
      child: fill
          ? placeholderContent
          : FittedBox(
              fit: BoxFit.scaleDown,
              child: placeholderContent,
            ),
    );

    final hasFrame = frameBytes != null && frameBytes!.isNotEmpty;
    final preview = LayoutBuilder(
      builder: (context, constraints) {
        final effectiveFrameWidth = frameWidth?.toDouble() ?? 0;
        final effectiveFrameHeight = frameHeight?.toDouble() ?? 0;
        final canPlaceCursor = hasFrame &&
            cursorPosition != null &&
            effectiveFrameWidth > 0 &&
            effectiveFrameHeight > 0 &&
            constraints.hasBoundedWidth &&
            constraints.hasBoundedHeight;

        double? cursorLeft;
        double? cursorTop;
        final cursorSize = _cursorSize(pointerSize, pointerStyle, fill);
        if (canPlaceCursor) {
          final cursorHotspot = _cursorHotspot(pointerStyle, cursorSize);
          final scale = math.min(
            constraints.maxWidth / effectiveFrameWidth,
            constraints.maxHeight / effectiveFrameHeight,
          );
          final fittedWidth = effectiveFrameWidth * scale;
          final fittedHeight = effectiveFrameHeight * scale;
          final offsetX = (constraints.maxWidth - fittedWidth) / 2;
          final offsetY = (constraints.maxHeight - fittedHeight) / 2;
          cursorLeft =
              offsetX + (cursorPosition!.dx * scale) - cursorHotspot.dx;
          cursorTop = offsetY + (cursorPosition!.dy * scale) - cursorHotspot.dy;
        }

        return Container(
          decoration: BoxDecoration(
            color: fill ? Colors.black : c.previewSurface,
            borderRadius: BorderRadius.circular(fill ? 0 : 12),
            border: fill
                ? null
                : Border.all(
                    color: isConnected
                        ? c.green.withValues(alpha: 0.4)
                        : c.border),
          ),
          clipBehavior: Clip.hardEdge,
          child: Stack(
            fit: StackFit.expand,
            children: [
              Positioned.fill(
                child: GestureDetector(
                  onDoubleTap: hasFrame ? _resetZoom : null,
                  child: InteractiveViewer(
                    transformationController: _transformationController,
                    minScale: 1.0,
                    maxScale: fill ? 4.0 : 3.0,
                    panEnabled: hasFrame,
                    scaleEnabled: hasFrame,
                    constrained: true,
                    clipBehavior: Clip.none,
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        if (hasFrame)
                          Positioned.fill(
                            child: Image.memory(
                              frameBytes!,
                              fit: BoxFit.contain,
                              gaplessPlayback: true,
                            ),
                          )
                        else
                          Positioned.fill(child: placeholder),
                        if (canPlaceCursor)
                          Positioned(
                            left: cursorLeft!.clamp(
                              0.0,
                              math.max(
                                0.0,
                                constraints.maxWidth - cursorSize.width,
                              ),
                            ),
                            top: cursorTop!.clamp(
                              0.0,
                              math.max(
                                0.0,
                                constraints.maxHeight - cursorSize.height,
                              ),
                            ),
                            child: IgnorePointer(
                              child: SizedBox(
                                width: cursorSize.width,
                                height: cursorSize.height,
                                child: CustomPaint(
                                  painter: _CursorPainter(style: pointerStyle),
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
              if (hasFrame && !fill)
                Positioned(
                  left: 10,
                  bottom: 10,
                  child: _StreamBadge(label: 'LIVE SCREEN $activeMonitor'),
                ),
            ],
          ),
        );
      },
    );

    return AnimatedContainer(
      duration: const Duration(milliseconds: 300),
      curve: Curves.easeInOut,
      child: fill
          ? SizedBox.expand(child: preview)
          : AspectRatio(
              aspectRatio: finalAspectRatio,
              child: preview,
            ),
    );
  }

  String _statusLabel() {
    if (!isConnected) return 'STREAM OFFLINE';
    switch (streamStatus) {
      case PreviewStreamStatus.starting:
        return 'STARTING PREVIEW';
      case PreviewStreamStatus.active:
        return frameBytes == null
            ? 'STREAM ACTIVE'
            : 'LIVE SCREEN $activeMonitor';
      case PreviewStreamStatus.error:
        return streamError ?? 'STREAM ERROR';
      case PreviewStreamStatus.stopped:
        return 'TAP START PREVIEW — SCREEN $activeMonitor';
    }
  }

  Size _cursorSize(String size, String style, bool fullscreen) {
    final normal = switch (size) {
      'Micro' => 5.5,
      'Tiny' => 7.0,
      'Medium' => 11.5,
      _ => 9.0,
    };
    final width = fullscreen ? normal + 3.0 : normal;
    if (style == 'Dot Cursor' || style == 'Small Crosshair') {
      final side = math.max(fullscreen ? 8.0 : 6.0, width + 1.0);
      return Size.square(side);
    }
    return Size(width, width * 1.28);
  }

  Offset _cursorHotspot(String style, Size size) {
    if (style == 'Dot Cursor' || style == 'Small Crosshair') {
      return Offset(size.width / 2, size.height / 2);
    }
    if (style == 'Minimal Arrow' || style == 'Thin Arrow') {
      return Offset(size.width * 0.16, size.height * 0.10);
    }
    return Offset(size.width * 0.14, size.height * 0.08);
  }
}

class _StreamBadge extends StatelessWidget {
  final String label;

  const _StreamBadge({required this.label});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.55),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: Colors.white.withValues(alpha: 0.15)),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: Colors.white.withValues(alpha: 0.85),
          fontSize: 9,
          fontWeight: FontWeight.w700,
          letterSpacing: 0,
        ),
      ),
    );
  }
}

class _CursorPainter extends CustomPainter {
  final String style;

  const _CursorPainter({required this.style});

  @override
  void paint(Canvas canvas, Size size) {
    switch (style) {
      case 'Classic Arrow':
      case 'Standard Arrow':
        _paintStandardArrow(canvas, size);
        return;
      case 'Minimal Arrow':
        _paintMinimalArrow(canvas, size);
        return;
      case 'Thin Arrow':
        _paintThinArrow(canvas, size);
        return;
      case 'Dot Cursor':
        _paintDot(canvas, size);
        return;
      case 'Small Crosshair':
        _paintCrosshair(canvas, size);
        return;
      default:
        _paintStandardArrow(canvas, size);
        return;
    }
  }

  void _paintStandardArrow(Canvas canvas, Size size) {
    final shadowPaint = Paint()
      ..color = Colors.black.withValues(alpha: 0.25)
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 2);
    final fillPaint = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.fill;
    final outlinePaint = Paint()
      ..color = Colors.black
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.0
      ..strokeJoin = StrokeJoin.round
      ..strokeCap = StrokeCap.round;

    final path = Path()
      ..moveTo(size.width * 0.14, size.height * 0.08)
      ..lineTo(size.width * 0.88, size.height * 0.56)
      ..lineTo(size.width * 0.58, size.height * 0.60)
      ..lineTo(size.width * 0.72, size.height * 0.92)
      ..lineTo(size.width * 0.54, size.height * 0.98)
      ..lineTo(size.width * 0.40, size.height * 0.64)
      ..lineTo(size.width * 0.18, size.height * 0.84)
      ..close();

    final shadowPath = path.shift(const Offset(1.0, 1.2));
    canvas.drawPath(shadowPath, shadowPaint);
    canvas.drawPath(path, fillPaint);
    canvas.drawPath(path, outlinePaint);
  }

  void _paintMinimalArrow(Canvas canvas, Size size) {
    final path = Path()
      ..moveTo(size.width * 0.16, size.height * 0.10)
      ..lineTo(size.width * 0.82, size.height * 0.50)
      ..lineTo(size.width * 0.56, size.height * 0.56)
      ..lineTo(size.width * 0.68, size.height * 0.86)
      ..lineTo(size.width * 0.50, size.height * 0.92)
      ..lineTo(size.width * 0.38, size.height * 0.62)
      ..lineTo(size.width * 0.20, size.height * 0.76)
      ..close();
    final shadow = Paint()
      ..color = Colors.black.withValues(alpha: 0.28)
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 1.5);
    final fill = Paint()
      ..color = Colors.white.withValues(alpha: 0.92)
      ..style = PaintingStyle.fill;
    final outline = Paint()
      ..color = Colors.black.withValues(alpha: 0.82)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 0.9
      ..strokeJoin = StrokeJoin.round;
    canvas.drawPath(path.shift(const Offset(0.8, 1.0)), shadow);
    canvas.drawPath(path, fill);
    canvas.drawPath(path, outline);
  }

  void _paintThinArrow(Canvas canvas, Size size) {
    final path = Path()
      ..moveTo(size.width * 0.16, size.height * 0.10)
      ..lineTo(size.width * 0.82, size.height * 0.52)
      ..moveTo(size.width * 0.16, size.height * 0.10)
      ..lineTo(size.width * 0.28, size.height * 0.84)
      ..moveTo(size.width * 0.34, size.height * 0.48)
      ..lineTo(size.width * 0.68, size.height * 0.88);
    final shadow = Paint()
      ..color = Colors.black.withValues(alpha: 0.85)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3.0
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    final stroke = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.35
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    canvas.drawPath(path, shadow);
    canvas.drawPath(path, stroke);
  }

  void _paintDot(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = math.max(2.2, size.shortestSide * 0.30);
    final shadow = Paint()
      ..color = Colors.black.withValues(alpha: 0.45)
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 2);
    final fill = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.fill;
    final outline = Paint()
      ..color = Colors.black
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.2;
    canvas.drawCircle(center.translate(0.8, 1.0), radius, shadow);
    canvas.drawCircle(center, radius, fill);
    canvas.drawCircle(center, radius, outline);
  }

  void _paintCrosshair(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.shortestSide * 0.36;
    final shadow = Paint()
      ..color = Colors.black.withValues(alpha: 0.85)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3.0
      ..strokeCap = StrokeCap.round;
    final stroke = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.35
      ..strokeCap = StrokeCap.round;
    final path = Path()
      ..moveTo(center.dx - radius, center.dy)
      ..lineTo(center.dx + radius, center.dy)
      ..moveTo(center.dx, center.dy - radius)
      ..lineTo(center.dx, center.dy + radius);
    canvas.drawPath(path, shadow);
    canvas.drawPath(path, stroke);
    canvas.drawCircle(center, math.max(1.4, size.shortestSide * 0.08), stroke);
  }

  @override
  bool shouldRepaint(covariant _CursorPainter oldDelegate) =>
      oldDelegate.style != style;
}
