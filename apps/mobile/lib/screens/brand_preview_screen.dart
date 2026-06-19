import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import '../widgets/app_logo.dart';

class BrandPreviewScreen extends StatelessWidget {
  const BrandPreviewScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final c = context.colors;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Brand Preview'),
      ),
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            final isWide = constraints.maxWidth >= 760;
            return SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 980),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        'RemoteLink',
                        style: Theme.of(context)
                            .textTheme
                            .headlineLarge
                            ?.copyWith(fontWeight: FontWeight.w700),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'In-app logo is rendered with Flutter vector drawing, not image assets.',
                        style: Theme.of(context)
                            .textTheme
                            .labelSmall
                            ?.copyWith(color: c.textMuted),
                      ),
                      const SizedBox(height: 24),
                      GridView.count(
                        crossAxisCount: isWide ? 2 : 1,
                        mainAxisSpacing: 16,
                        crossAxisSpacing: 16,
                        childAspectRatio: isWide ? 1.45 : 1.2,
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        children: [
                          _PreviewTile(
                            title: 'Android Launcher Icon (Adaptive Sim)',
                            child: _AndroidLauncherPreview(),
                          ),
                          _PreviewTile(
                            title: 'Android Splash Icon (System Sim)',
                            child: _AndroidSplashPreview(),
                          ),
                          const _PreviewTile(
                            title: 'In-App Logo (UNCHANGED)',
                            child: AppLogo(size: 100),
                          ),
                          _PreviewTile(
                            title: 'Dark Theme Logo Container',
                            child: _ThemeLogoPreview(
                                theme: AppTheme.professionalDark()),
                          ),
                        ],
                      ),
                      const SizedBox(height: 20),
                      const Wrap(
                        spacing: 10,
                        runSpacing: 10,
                        children: [
                          _RouteChip(
                              label: 'Connect Preview',
                              route: '/connect-preview'),
                          _RouteChip(
                              label: 'Controls Preview',
                              route: '/controls-preview'),
                          _RouteChip(
                              label: 'Settings Preview',
                              route: '/settings-preview'),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}

class _PreviewTile extends StatelessWidget {
  final String title;
  final Widget child;

  const _PreviewTile({required this.title, required this.child});

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: c.card,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: c.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: TextStyle(
                color: c.textPrimary,
                fontSize: 15,
                fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 18),
          Expanded(
            child: Center(child: child),
          ),
        ],
      ),
    );
  }
}

class _ThemeLogoPreview extends StatelessWidget {
  final ThemeData theme;

  const _ThemeLogoPreview({required this.theme});

  @override
  Widget build(BuildContext context) {
    final colors = theme.extension<AppColors>()!;
    return Theme(
      data: theme,
      child: Builder(
        builder: (context) => Container(
          width: 160,
          height: 160,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: colors.background,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: colors.border),
          ),
          child: const AppLogo(size: 96),
        ),
      ),
    );
  }
}

class _AndroidLauncherPreview extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      width: 100,
      height: 100,
      decoration: const BoxDecoration(
        color: Colors.white,
        shape: BoxShape.circle,
        boxShadow: [BoxShadow(color: Colors.black12, blurRadius: 4, offset: Offset(0, 2))],
      ),
      child: Center(
        child: SizedBox(
          width: 80,
          height: 80,
          child: CustomPaint(painter: _LinkRingPainter()),
        ),
      ),
    );
  }
}

class _AndroidSplashPreview extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      height: double.infinity,
      decoration: const BoxDecoration(
        color: Color(0xFF0B0C0F),
        borderRadius: BorderRadius.all(Radius.circular(8)),
      ),
      child: Center(
        child: Container(
          width: 80,
          height: 80,
          decoration: const BoxDecoration(
            color: Colors.white,
            shape: BoxShape.circle,
          ),
          child: Center(
            child: SizedBox(
              width: 50,
              height: 50,
              child: CustomPaint(painter: _LinkRingPainter(strokeWidth: 4)),
            ),
          ),
        ),
      ),
    );
  }
}

class _LinkRingPainter extends CustomPainter {
  final double strokeWidth;
  _LinkRingPainter({this.strokeWidth = 6});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Colors.black
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..isAntiAlias = true;

    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width * 0.4;
    canvas.drawCircle(center, radius, paint);

    paint.style = PaintingStyle.fill;
    final path = Path();
    
    // Left Chevron
    path.moveTo(size.width * 0.45, size.height * 0.35);
    path.lineTo(size.width * 0.32, size.height * 0.5);
    path.lineTo(size.width * 0.45, size.height * 0.65);
    path.lineTo(size.width * 0.52, size.height * 0.58);
    path.lineTo(size.width * 0.42, size.height * 0.5);
    path.lineTo(size.width * 0.52, size.height * 0.42);
    path.close();

    // Right Chevron
    path.moveTo(size.width * 0.55, size.height * 0.35);
    path.lineTo(size.width * 0.68, size.height * 0.5);
    path.lineTo(size.width * 0.55, size.height * 0.65);
    path.lineTo(size.width * 0.48, size.height * 0.58);
    path.lineTo(size.width * 0.58, size.height * 0.5);
    path.lineTo(size.width * 0.48, size.height * 0.42);
    path.close();

    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(CustomPainter oldDelegate) => false;
}

class _RouteChip extends StatelessWidget {
  final String label;
  final String route;

  const _RouteChip({required this.label, required this.route});

  @override
  Widget build(BuildContext context) {
    return OutlinedButton(
      onPressed: () => Navigator.of(context).pushNamed(route),
      child: Text(label),
    );
  }
}
