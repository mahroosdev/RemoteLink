import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../theme/app_theme.dart';
import '../widgets/screen_preview.dart';
import '../models/app_state.dart';

/// Fullscreen PC preview. Hides the app navigation (pushed as its own route)
/// and owns real device orientation while it is visible.
class FullscreenPreviewScreen extends StatefulWidget {
  final AppState state;
  const FullscreenPreviewScreen({super.key, required this.state});

  @override
  State<FullscreenPreviewScreen> createState() =>
      _FullscreenPreviewScreenState();
}

class _FullscreenPreviewScreenState extends State<FullscreenPreviewScreen> {
  bool _isLandscape = true;
  bool _restoredPortrait = false;

  AppState get state => widget.state;

  @override
  void initState() {
    super.initState();
    unawaited(_applyFullscreenOrientation());
  }

  @override
  void dispose() {
    unawaited(_restorePortrait());
    super.dispose();
  }

  Future<void> _applyFullscreenOrientation() async {
    _restoredPortrait = false;
    await SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
    await SystemChrome.setPreferredOrientations(
      _isLandscape
          ? [
              DeviceOrientation.landscapeLeft,
              DeviceOrientation.landscapeRight,
            ]
          : [DeviceOrientation.portraitUp],
    );
  }

  Future<void> _restorePortrait() async {
    if (_restoredPortrait) return;
    _restoredPortrait = true;
    await SystemChrome.setPreferredOrientations([
      DeviceOrientation.portraitUp,
    ]);
    await SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
  }

  Future<void> _toggleOrientation() async {
    setState(() => _isLandscape = !_isLandscape);
    await _applyFullscreenOrientation();
  }

  Future<void> _close() async {
    await _restorePortrait();
    if (mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Scaffold(
      backgroundColor: c.previewSurface,
      body: Stack(
        fit: StackFit.expand,
        children: [
          Positioned.fill(
            child: ListenableBuilder(
              listenable: state,
              builder: (context, _) => ScreenPreview(
                isConnected: state.isConnected,
                activeMonitor: state.activeMonitor,
                layoutMode: _isLandscape ? 'landscape' : 'portrait',
                fill: true,
              ),
            ),
          ),
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: SafeArea(
              child: Padding(
                padding: const EdgeInsets.all(8),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _OverlayButton(
                      icon: Icons.close,
                      tooltip: 'Close fullscreen',
                      onTap: _close,
                    ),
                    const Spacer(),
                    _OverlayButton(
                      icon: Icons.screen_rotation,
                      tooltip:
                          _isLandscape ? 'Rotate portrait' : 'Rotate landscape',
                      onTap: _toggleOrientation,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _OverlayButton extends StatelessWidget {
  final IconData icon;
  final String tooltip;
  final VoidCallback onTap;

  const _OverlayButton(
      {required this.icon, required this.tooltip, required this.onTap});

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
