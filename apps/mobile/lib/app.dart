import 'package:flutter/material.dart';
import 'theme/app_theme.dart';
import 'models/app_state.dart';
import 'screens/connect_screen.dart';
import 'screens/remote_control_screen.dart';
import 'screens/settings_screen.dart';
import 'screens/manual_screen.dart';

class RemoteLinkApp extends StatefulWidget {
  const RemoteLinkApp({super.key});

  @override
  State<RemoteLinkApp> createState() => _RemoteLinkAppState();
}

class _RemoteLinkAppState extends State<RemoteLinkApp> {
  final AppState _state = AppState();
  int _currentIndex = 0;

  @override
  void dispose() {
    _state.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Only theme changes rebuild MaterialApp; ordinary settings toggles and
    // interaction state never touch the app shell, so navigation stays stable.
    return ValueListenableBuilder<String>(
      valueListenable: _state.themeMode,
      builder: (context, mode, _) => MaterialApp(
        title: 'RemoteLink Pro',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.themeFor(mode),
        // Portrait: bottom navigation. Landscape: compact side rail so the
        // short viewport keeps its height for content. Same _currentIndex —
        // rotating the device never loses the selected tab.
        home: OrientationBuilder(
          builder: (context, orientation) {
            final isLandscape = orientation == Orientation.landscape;

            // IndexedStack keeps all four screens alive so settings values,
            // scan results and held keys survive tab switches without rebuilds.
            final screens = IndexedStack(
              index: _currentIndex,
              children: [
                ConnectScreen(
                  state: _state,
                  onConnected: () => setState(() => _currentIndex = 1),
                ),
                RemoteControlScreen(state: _state),
                SettingsScreen(state: _state),
                const ManualScreen(),
              ],
            );

            return Scaffold(
              body: isLandscape
                  ? Row(
                      children: [
                        SafeArea(
                          child: NavigationRail(
                            selectedIndex: _currentIndex,
                            onDestinationSelected: (index) => setState(() => _currentIndex = index),
                            labelType: NavigationRailLabelType.all,
                            destinations: const [
                              NavigationRailDestination(icon: Icon(Icons.wifi), label: Text('Connect')),
                              NavigationRailDestination(icon: Icon(Icons.settings_remote), label: Text('Remote')),
                              NavigationRailDestination(icon: Icon(Icons.settings), label: Text('Settings')),
                              NavigationRailDestination(icon: Icon(Icons.book), label: Text('Manual')),
                            ],
                          ),
                        ),
                        const VerticalDivider(width: 1, thickness: 1),
                        Expanded(child: screens),
                      ],
                    )
                  : screens,
              bottomNavigationBar: isLandscape
                  ? null
                  : BottomNavigationBar(
                      currentIndex: _currentIndex,
                      onTap: (index) => setState(() => _currentIndex = index),
                      items: const [
                        BottomNavigationBarItem(icon: Icon(Icons.wifi), label: 'Connect'),
                        BottomNavigationBarItem(icon: Icon(Icons.settings_remote), label: 'Remote'),
                        BottomNavigationBarItem(icon: Icon(Icons.settings), label: 'Settings'),
                        BottomNavigationBarItem(icon: Icon(Icons.book), label: 'Manual'),
                      ],
                    ),
            );
          },
        ),
      ),
    );
  }
}
