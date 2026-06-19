import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

class ScreenPreview extends StatelessWidget {
  final bool isConnected;
  final int activeMonitor;
  final String layoutMode;

  /// If provided, overrides the default aspect ratio.
  final double? aspectRatio;
  final bool fill;

  const ScreenPreview({
    super.key,
    required this.isConnected,
    required this.activeMonitor,
    this.layoutMode = 'portrait',
    this.aspectRatio,
    this.fill = false,
  });

  @override
  Widget build(BuildContext context) {
    final c = context.colors;

    // Visually differentiate the preview canvas based on layout mode.
    final isLandscape = layoutMode == 'landscape';
    final currentAspectRatio = isLandscape ? 16 / 9 : 4 / 3;
    final finalAspectRatio = aspectRatio ?? currentAspectRatio;
    final status = isConnected
        ? 'WAITING FOR STREAM — SCREEN $activeMonitor'
        : 'STREAM OFFLINE';
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

    final preview = Container(
      decoration: BoxDecoration(
        color: fill ? Colors.black : c.previewSurface,
        borderRadius: BorderRadius.circular(fill ? 0 : 12),
        border: fill
            ? null
            : Border.all(
                color: isConnected ? c.green.withValues(alpha: 0.4) : c.border),
      ),
      child: Stack(
        fit: StackFit.expand,
        children: [
          Positioned.fill(child: placeholder),
        ],
      ),
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
}
