import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

class ScreenPreview extends StatelessWidget {
  final bool isConnected;
  final int activeMonitor;

  /// 16:9 by default; the fullscreen view passes 9:16 when rotated upright.
  final double aspectRatio;

  const ScreenPreview({
    super.key,
    required this.isConnected,
    required this.activeMonitor,
    this.aspectRatio = 16 / 9,
  });

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return AspectRatio(
      aspectRatio: aspectRatio,
      child: Container(
        decoration: BoxDecoration(
          color: c.previewSurface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: isConnected ? c.green.withValues(alpha: 0.4) : c.border),
        ),
        // Monitor identity lives in the selector below the preview — no badge
        // here, so the information is never duplicated.
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Preview surface is dark in every theme; use fixed light
              // tones so the hint stays readable in Light mode too.
              Icon(
                isConnected ? Icons.monitor : Icons.monitor_outlined,
                color: isConnected ? c.blue.withValues(alpha: 0.6) : Colors.white.withValues(alpha: 0.25),
                size: 40,
              ),
              const SizedBox(height: 12),
              Text(
                isConnected ? 'WAITING FOR STREAM — SCREEN $activeMonitor' : 'STREAM OFFLINE',
                style: TextStyle(
                  color: Colors.white.withValues(alpha: isConnected ? 0.6 : 0.35),
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 1,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
