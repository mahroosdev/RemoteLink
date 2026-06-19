import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'theme/app_theme.dart';
import 'models/app_state.dart';
import 'screens/brand_preview_screen.dart';
import 'screens/connect_screen.dart';
import 'screens/dev_preview_screen.dart';
import 'screens/remote_control_screen.dart';
import 'screens/settings_screen.dart';
import 'screens/manual_screen.dart';

import 'package:flutter/services.dart';

class RemoteLinkApp extends StatefulWidget {
  final AppState? state;
  final bool ownsState;

  const RemoteLinkApp({super.key, this.state, this.ownsState = false});

  @override
  State<RemoteLinkApp> createState() => _RemoteLinkAppState();
}

class _RemoteLinkAppState extends State<RemoteLinkApp> {
  late final AppState _state;
  late final bool _ownsState;
  int _currentIndex = 0;

  @override
  void initState() {
    super.initState();
    _state = widget.state ?? AppState();
    _ownsState = widget.state == null || widget.ownsState;
    _lockAppPortrait();
  }

  @override
  void dispose() {
    if (_ownsState) {
      _state.dispose();
    }
    super.dispose();
  }

  void _onTabTapped(int index) {
    setState(() => _currentIndex = index);
  }

  void _lockAppPortrait() {
    SystemChrome.setPreferredOrientations([
      DeviceOrientation.portraitUp,
    ]);
  }

  @override
  Widget build(BuildContext context) {
    // Only theme changes rebuild MaterialApp; ordinary settings toggles and
    // interaction state never touch the app shell, so navigation stays stable.
    return ValueListenableBuilder<String>(
      valueListenable: _state.themeMode,
      builder: (context, mode, _) => MaterialApp(
        title: 'RemoteLink',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.themeFor(mode),
        routes: {
          if (kDebugMode)
            '/dev-preview': (_) => DevPreviewScreen(state: _state),
          if (kDebugMode) '/brand-preview': (_) => const BrandPreviewScreen(),
          if (kDebugMode)
            '/connect-preview': (_) => ConnectScreen(
                state: _state, onConnected: () => _onTabTapped(1)),
          if (kDebugMode)
            '/controls-preview': (_) => RemoteControlScreen(state: _state),
          if (kDebugMode)
            '/settings-preview': (_) => SettingsScreen(state: _state),
        },
        home: Builder(
          builder: (context) {
            // IndexedStack keeps all four screens alive so settings values,
            // scan results and held keys survive tab switches without rebuilds.
            final screens = IndexedStack(
              index: _currentIndex,
              children: [
                ConnectScreen(
                  state: _state,
                  onConnected: () => _onTabTapped(1),
                ),
                RemoteControlScreen(state: _state),
                SettingsScreen(state: _state),
                const ManualScreen(),
              ],
            );

            return Scaffold(
              body: screens,
              bottomNavigationBar: BottomNavigationBar(
                currentIndex: _currentIndex,
                onTap: _onTabTapped,
                items: const [
                  BottomNavigationBarItem(
                      icon: Icon(Icons.wifi), label: 'Connect'),
                  BottomNavigationBarItem(
                      icon: Icon(Icons.settings_remote), label: 'Remote'),
                  BottomNavigationBarItem(
                      icon: Icon(Icons.settings), label: 'Settings'),
                  BottomNavigationBarItem(
                      icon: Icon(Icons.book), label: 'Manual'),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}
