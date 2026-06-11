import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import '../widgets/screen_preview.dart';
import '../models/app_state.dart';

/// Fullscreen PC preview. Hides the app navigation (pushed as its own route)
/// and offers a manual rotate that flips only this view between a 16:9
/// landscape canvas and a 9:16 portrait canvas — independent of the device.
class FullscreenPreviewScreen extends StatelessWidget {
  final AppState state;
  const FullscreenPreviewScreen({super.key, required this.state});

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Scaffold(
      backgroundColor: c.previewSurface,
      body: SafeArea(
        child: Stack(
          children: [
            Center(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: ValueListenableBuilder<String>(
                  valueListenable: state.fullscreenPreviewOrientation,
                  builder: (context, orientation, _) => ListenableBuilder(
                    listenable: state,
                    builder: (context, _) => ScreenPreview(
                      isConnected: state.isConnected,
                      activeMonitor: state.activeMonitor,
                      aspectRatio: orientation == 'portrait' ? 9 / 16 : 16 / 9,
                    ),
                  ),
                ),
              ),
            ),
            Positioned(
              top: 8,
              left: 8,
              child: _OverlayButton(
                icon: Icons.close,
                tooltip: 'Close fullscreen',
                onTap: () => Navigator.of(context).pop(),
              ),
            ),
            Positioned(
              top: 8,
              right: 8,
              child: _OverlayButton(
                icon: Icons.screen_rotation,
                tooltip: 'Rotate preview',
                onTap: state.toggleFullscreenOrientation,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _OverlayButton extends StatelessWidget {
  final IconData icon;
  final String tooltip;
  final VoidCallback onTap;

  const _OverlayButton({required this.icon, required this.tooltip, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.08),
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white.withValues(alpha: 0.15)),
      ),
      child: IconButton(
        icon: Icon(icon, size: 20, color: Colors.white.withValues(alpha: 0.85)),
        tooltip: tooltip,
        onPressed: onTap,
      ),
    );
  }
}
