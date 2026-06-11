import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

class AppLogo extends StatelessWidget {
  final double size;
  const AppLogo({super.key, this.size = 48});

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: c.textPrimary,
        borderRadius: BorderRadius.circular(size * 0.25),
      ),
      child: Center(
        child: Stack(
          alignment: Alignment.center,
          children: [
            Icon(Icons.monitor, size: size * 0.6, color: c.background),
            Positioned(
              bottom: 0,
              right: 0,
              child: Container(
                padding: const EdgeInsets.all(1),
                decoration: BoxDecoration(
                  color: c.textPrimary,
                  borderRadius: BorderRadius.circular(2),
                ),
                child: Icon(Icons.smartphone, size: size * 0.3, color: c.background),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
