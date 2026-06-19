import 'package:flutter/material.dart';

import '../models/app_state.dart';
import '../theme/app_theme.dart';
import '../widgets/app_logo.dart';

class DevPreviewScreen extends StatelessWidget {
  final AppState state;

  const DevPreviewScreen({super.key, required this.state});

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Scaffold(
      appBar: AppBar(title: const Text('Dev Preview')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            Row(
              children: [
                const AppLogo(size: 72),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('RemoteLink',
                          style: Theme.of(context).textTheme.headlineLarge),
                      const SizedBox(height: 4),
                      Text('Preview core mobile surfaces before APK install',
                          style: TextStyle(color: c.textMuted, fontSize: 12)),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 24),
            const _PreviewLink(
                title: 'Brand/AppLogo Preview', route: '/brand-preview'),
            const _PreviewLink(
                title: 'Connect Screen Preview', route: '/connect-preview'),
            const _PreviewLink(
                title: 'Remote Controls Preview', route: '/controls-preview'),
            const _PreviewLink(
                title: 'Settings Preview', route: '/settings-preview'),
            const SizedBox(height: 24),
            ValueListenableBuilder<String>(
              valueListenable: state.themeMode,
              builder: (context, mode, _) => Text(
                'Current theme: $mode',
                style: TextStyle(
                    color: c.textSecondary, fontWeight: FontWeight.w600),
              ),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              children: [
                for (final mode in AppTheme.themeModes)
                  OutlinedButton(
                    onPressed: () => state.setThemeMode(mode),
                    child: Text(mode),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _PreviewLink extends StatelessWidget {
  final String title;
  final String route;

  const _PreviewLink({required this.title, required this.route});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: ListTile(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(8),
          side: BorderSide(color: context.colors.border),
        ),
        title: Text(title),
        trailing: const Icon(Icons.chevron_right),
        onTap: () => Navigator.of(context).pushNamed(route),
      ),
    );
  }
}
