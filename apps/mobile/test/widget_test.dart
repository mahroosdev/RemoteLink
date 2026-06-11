import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:remotelink_mobile/app.dart';
import 'package:remotelink_mobile/screens/fullscreen_preview_screen.dart';
import 'package:remotelink_mobile/screens/remote_control_screen.dart';
import 'package:remotelink_mobile/screens/settings_screen.dart';
import 'package:remotelink_mobile/widgets/touchpad_area.dart';

void main() {
  // Phone-sized surface so RenderFlex overflows fail these tests.
  Future<void> pumpApp(WidgetTester tester) async {
    tester.view.physicalSize = const Size(375, 812);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(const RemoteLinkApp());
  }

  // Lets pending snackbars expire so they stop blocking taps near the bottom.
  Future<void> clearSnackbars(WidgetTester tester) async {
    await tester.pump(const Duration(seconds: 3));
    await tester.pumpAndSettle();
  }

  Future<void> connect(WidgetTester tester) async {
    await tester.enterText(find.widgetWithText(TextField, 'PC Host IP'), '192.168.0.24');
    await tester.enterText(find.widgetWithText(TextField, 'Pairing Code'), '123456');
    await tester.tap(find.text('Connect to PC'));
    await tester.pump(const Duration(milliseconds: 900));
    await tester.pumpAndSettle();
    await clearSnackbars(tester);
  }

  Finder scrollableIn(Type screen) =>
      find.descendant(of: find.byType(screen), matching: find.byType(Scrollable)).first;

  Future<void> revealAndTap(WidgetTester tester, Finder scrollable, Finder target) async {
    await tester.scrollUntilVisible(target, 100, scrollable: scrollable);
    // Pull the target away from the viewport edge so the tap lands cleanly.
    await tester.drag(scrollable, const Offset(0, -100));
    await tester.pumpAndSettle();
    await tester.tap(target);
    await tester.pumpAndSettle();
  }

  testWidgets('boots to Connect screen and tabs switch', (tester) async {
    await pumpApp(tester);

    expect(find.text('RemoteLink Pro'), findsOneWidget);
    expect(find.text('Connect to PC'), findsOneWidget);
    expect(find.text('DISCONNECTED'), findsOneWidget);

    await tester.tap(find.byIcon(Icons.book));
    await tester.pumpAndSettle();
    expect(find.text('Application Manual'), findsOneWidget);
  });

  testWidgets('scan finds nothing honestly and never fills the IP', (tester) async {
    await pumpApp(tester);

    expect(find.text('DISCONNECTED'), findsOneWidget);
    // The demo-entry option was removed entirely.
    expect(find.text('Use demo PC'), findsNothing);
    expect(find.text('Demo PC address for UI testing only'), findsNothing);

    await tester.tap(find.text('Scan for local devices'));
    await tester.pump();
    expect(find.text('Scanning local network...'), findsOneWidget);

    await tester.pump(const Duration(milliseconds: 1100));
    await tester.pumpAndSettle();
    expect(find.text('No RemoteLink desktop found'), findsOneWidget);
    expect(find.text('NO DESKTOP FOUND'), findsOneWidget); // status pill
    // No fabricated device and no auto-filled IP.
    expect(find.textContaining('RemoteLink Desktop Demo'), findsNothing);
    expect(find.widgetWithText(TextField, '192.168.0.24'), findsNothing);
  });

  testWidgets('connect validates IP and pairing code', (tester) async {
    await pumpApp(tester);

    await tester.tap(find.text('Connect to PC'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Enter a valid Host IP'), findsOneWidget);
    await clearSnackbars(tester);

    await tester.enterText(find.widgetWithText(TextField, 'PC Host IP'), '192.168.0.24');
    await tester.enterText(find.widgetWithText(TextField, 'Pairing Code'), '123');
    await tester.tap(find.text('Connect to PC'));
    await tester.pumpAndSettle();
    expect(find.textContaining('must be exactly 6 digits'), findsOneWidget);
  });

  testWidgets('valid connect navigates to Remote and detects monitors', (tester) async {
    await pumpApp(tester);

    // Offline: no monitor buttons, just the detection hint.
    await tester.tap(find.byIcon(Icons.settings_remote));
    await tester.pumpAndSettle();
    expect(find.text('Connect to PC to detect available screens.'), findsOneWidget);
    expect(find.text('Screen 1'), findsNothing);
    expect(find.text('STREAM OFFLINE'), findsOneWidget);
    await tester.tap(find.byIcon(Icons.wifi));
    await tester.pumpAndSettle();

    await connect(tester);

    expect(find.text('Connected'), findsOneWidget);
    expect(find.textContaining('WAITING FOR STREAM'), findsOneWidget);
    expect(find.text('12MS'), findsOneWidget);
    // Mock detection reports 2 monitors → exactly Screen 1 and Screen 2.
    expect(find.text('Connect to PC to detect available screens.'), findsNothing);
    expect(find.text('Screen 1'), findsOneWidget);
    expect(find.text('Screen 2'), findsOneWidget);
    expect(find.text('Screen 3'), findsNothing);

    // Switching monitors updates the preview label.
    await tester.tap(find.text('Screen 2'));
    await tester.pump();
    expect(find.textContaining('SCREEN 2'), findsOneWidget);
  });

  testWidgets('touchpad logs pointer movement and pointer toggle works', (tester) async {
    await pumpApp(tester);
    await connect(tester);

    expect(tester.widget<TouchpadArea>(find.byType(TouchpadArea)).showPointer, isTrue);
    await tester.drag(find.byType(TouchpadArea), const Offset(40, 25));
    await tester.pumpAndSettle();
    expect(find.text('Pointer moved'), findsOneWidget);

    // Settings > Controls: Show Touchpad Pointer toggles and persists.
    await tester.tap(find.byIcon(Icons.settings));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('Show Touchpad Pointer'), 100,
        scrollable: scrollableIn(SettingsScreen));
    await tester.tap(find.text('Show Touchpad Pointer'));
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.settings_remote));
    await tester.pumpAndSettle();
    expect(tester.widget<TouchpadArea>(find.byType(TouchpadArea)).showPointer, isFalse);
  });

  testWidgets('manual layout toggle switches remote layout and persists', (tester) async {
    await pumpApp(tester);

    await tester.tap(find.byIcon(Icons.settings_remote));
    await tester.pumpAndSettle();

    // Portrait controls by default — no tool tabs even on a portrait device.
    expect(find.text('Landscape Controls'), findsOneWidget);
    expect(find.text('Keyboard'), findsNothing);
    expect(find.text('Basic Keys'), findsOneWidget);

    await tester.tap(find.text('Landscape Controls'));
    await tester.pumpAndSettle();

    // Narrow width → adaptive stacked landscape controls with tool tabs.
    expect(find.text('Portrait Controls'), findsOneWidget);
    expect(find.text('Mouse'), findsOneWidget);
    expect(find.text('Keyboard'), findsOneWidget);
    expect(find.text('Shortcuts'), findsOneWidget);
    expect(find.byType(TouchpadArea), findsOneWidget); // Mouse tab default
    expect(find.text('Remote layout switched to landscape'), findsOneWidget);

    // Choice persists across bottom-nav tab switches.
    await tester.tap(find.byIcon(Icons.wifi));
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.settings_remote));
    await tester.pumpAndSettle();
    expect(find.text('Portrait Controls'), findsOneWidget);

    // And back to portrait controls.
    await tester.tap(find.text('Portrait Controls'));
    await tester.pumpAndSettle();
    expect(find.text('Landscape Controls'), findsOneWidget);
    expect(find.text('Basic Keys'), findsOneWidget);
  });

  testWidgets('fullscreen preview opens, rotates manually, and closes', (tester) async {
    await pumpApp(tester);

    await tester.tap(find.byIcon(Icons.settings_remote));
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.fullscreen));
    await tester.pumpAndSettle();

    expect(find.byType(FullscreenPreviewScreen), findsOneWidget);
    final inFullscreen = find.byType(FullscreenPreviewScreen);
    double aspect() => tester
        .widget<AspectRatio>(
            find.descendant(of: inFullscreen, matching: find.byType(AspectRatio)))
        .aspectRatio;

    // Defaults to a 16:9 landscape canvas.
    expect(aspect(), closeTo(16 / 9, 0.001));

    // Manual rotate flips only the fullscreen canvas.
    final rotate = find.descendant(of: inFullscreen, matching: find.byIcon(Icons.screen_rotation));
    await tester.tap(rotate);
    await tester.pumpAndSettle();
    expect(aspect(), closeTo(9 / 16, 0.001));
    await tester.tap(rotate);
    await tester.pumpAndSettle();
    expect(aspect(), closeTo(16 / 9, 0.001));

    // Close returns to the Remote screen.
    await tester.tap(find.descendant(of: inFullscreen, matching: find.byIcon(Icons.close)));
    await tester.pumpAndSettle();
    expect(find.byType(FullscreenPreviewScreen), findsNothing);
    expect(find.text('Landscape Controls'), findsOneWidget);
  });

  testWidgets('landscape device uses nav rail; remote layout stays manual', (tester) async {
    tester.view.physicalSize = const Size(812, 375);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(const RemoteLinkApp());

    expect(find.byType(NavigationRail), findsOneWidget);
    expect(find.byType(BottomNavigationBar), findsNothing);

    await tester.tap(find.byIcon(Icons.settings_remote));
    await tester.pumpAndSettle();

    // Device is landscape but layout mode is manual: portrait controls stay.
    expect(find.text('Landscape Controls'), findsOneWidget);
    expect(find.text('Keyboard'), findsNothing);

    await tester.tap(find.text('Landscape Controls'));
    await tester.pumpAndSettle();

    // Wide screen → true two-panel dashboard with tool tabs.
    expect(find.text('Portrait Controls'), findsOneWidget);
    expect(find.text('Mouse'), findsOneWidget);
    expect(find.byType(TouchpadArea), findsOneWidget); // Mouse tab default
    expect(find.text('Connect to PC to detect available screens.'), findsOneWidget);

    await tester.tap(find.text('Keyboard'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(TextField, 'Type to PC...'), findsOneWidget);
    expect(find.text('Esc'), findsOneWidget);

    await tester.tap(find.text('Shortcuts'));
    await tester.pumpAndSettle();
    expect(find.text('Modifiers'), findsOneWidget); // expanded by default
    await tester.tap(find.text('Ctrl'));
    await tester.pump();
    expect(find.text('Held Ctrl'), findsOneWidget);
    await tester.tap(find.text('Release All Keys'));
    await tester.pump();
    expect(find.text('All virtual keys released'), findsOneWidget);

    // Settings renders two-column in landscape and toggles still work.
    await tester.tap(find.byIcon(Icons.settings));
    await tester.pumpAndSettle();
    final firstSwitch = find.byType(Switch).first;
    expect(tester.widget<Switch>(firstSwitch).value, isTrue);
    await tester.tap(firstSwitch);
    await tester.pumpAndSettle();
    expect(tester.widget<Switch>(firstSwitch).value, isFalse);
  });

  testWidgets('remote controls give feedback and panels expand without overflow', (tester) async {
    await pumpApp(tester);
    await connect(tester);

    await tester.tap(find.text('Left Click'));
    await tester.pump();
    expect(find.text('Left click sent'), findsOneWidget);

    await tester.tap(find.text('Scroll Down'));
    await tester.pump();
    expect(find.text('Scroll down'), findsOneWidget);

    // The 2x2 grid has exactly four buttons; the old Middle button is gone.
    expect(find.text('Middle'), findsNothing);

    final remoteScroll = scrollableIn(RemoteControlScreen);

    // Basic Keys panel is expanded by default.
    await revealAndTap(tester, remoteScroll, find.text('Esc'));
    expect(find.text('Esc pressed'), findsOneWidget);

    // Modifiers panel: expand, hold Ctrl, release all.
    await revealAndTap(tester, remoteScroll, find.text('Modifiers'));
    await revealAndTap(tester, remoteScroll, find.text('Ctrl'));
    expect(find.text('Held Ctrl'), findsOneWidget);
    await revealAndTap(tester, remoteScroll, find.text('Release All Keys'));
    expect(find.text('All virtual keys released'), findsOneWidget);

    // Actions panel: expand and use one.
    await revealAndTap(tester, remoteScroll, find.text('Actions'));
    await revealAndTap(tester, remoteScroll, find.text('Alt+Tab'));
    expect(find.text('Alt+Tab sent'), findsOneWidget);

    // Function Keys panel: expand; with all four panels open, scrolling to F12
    // is the worst-case overflow check.
    await revealAndTap(tester, remoteScroll, find.text('Function Keys'));
    await tester.scrollUntilVisible(find.text('F12'), 100, scrollable: remoteScroll);
    expect(find.text('F1'), findsOneWidget);
    expect(find.text('F12'), findsOneWidget);
  });

  testWidgets('typing to PC logs and clears, empty send warns in ticker', (tester) async {
    await pumpApp(tester);
    await connect(tester);

    // Empty send: in-page ticker warning, no SnackBar (taps must not flash).
    await tester.ensureVisible(find.byIcon(Icons.send_rounded));
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.send_rounded));
    await tester.pumpAndSettle();
    expect(find.textContaining('Nothing to send'), findsOneWidget);
    expect(find.byType(SnackBar), findsNothing);

    await tester.enterText(find.widgetWithText(TextField, 'Type to PC...'), 'hello world');
    await tester.ensureVisible(find.byIcon(Icons.send_rounded));
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.send_rounded));
    await tester.pump();
    expect(find.text('Sent text: hello world'), findsOneWidget);
    expect(find.widgetWithText(TextField, 'hello world'), findsNothing);
  });

  testWidgets('settings change and persist across tab switches', (tester) async {
    await pumpApp(tester);

    await tester.tap(find.byIcon(Icons.settings));
    await tester.pumpAndSettle();
    expect(find.text('Configuration'), findsOneWidget);

    final autoReconnect = find.byType(Switch).first;
    expect(tester.widget<Switch>(autoReconnect).value, isTrue);
    await tester.tap(autoReconnect);
    await tester.pumpAndSettle();
    expect(tester.widget<Switch>(autoReconnect).value, isFalse);

    // Selector bottom sheet updates the displayed value.
    await tester.scrollUntilVisible(find.text('Stream Resolution'), 100,
        scrollable: scrollableIn(SettingsScreen));
    await tester.tap(find.text('Stream Resolution'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('720p').last);
    await tester.pumpAndSettle();
    expect(find.text('720p'), findsOneWidget);

    // Slider updates displayed value (scroll back up to it first).
    await tester.scrollUntilVisible(find.text('Mouse Speed'), -100,
        scrollable: scrollableIn(SettingsScreen));
    expect(find.text('50'), findsOneWidget);
    await tester.drag(find.byType(Slider).first, const Offset(120, 0));
    await tester.pumpAndSettle();
    expect(find.text('50'), findsNothing);

    // Values survive switching tabs (IndexedStack keeps state alive).
    await tester.tap(find.byIcon(Icons.wifi));
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.settings));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('Auto Reconnect'), -100,
        scrollable: scrollableIn(SettingsScreen));
    expect(tester.widget<Switch>(find.byType(Switch).first).value, isFalse);
    await tester.scrollUntilVisible(find.text('720p'), 100,
        scrollable: scrollableIn(SettingsScreen));
    expect(find.text('720p'), findsOneWidget);
  });

  testWidgets('theme selector switches the real app theme and persists', (tester) async {
    await pumpApp(tester);

    Color scaffoldColor() =>
        tester.widget<MaterialApp>(find.byType(MaterialApp)).theme!.scaffoldBackgroundColor;

    expect(scaffoldColor(), const Color(0xFF0B0C0F)); // Professional Dark default

    await tester.tap(find.byIcon(Icons.settings));
    await tester.pumpAndSettle();

    final settingsScroll = scrollableIn(SettingsScreen);

    // Light theme
    await revealAndTap(tester, settingsScroll, find.text('App Theme'));
    await tester.tap(find.text('Light').last);
    await tester.pumpAndSettle();
    expect(scaffoldColor(), const Color(0xFFF7F7F8));
    // Theme changes are settings-only: they must not surface in the Remote
    // screen's last-action ticker.
    expect(find.text('Theme: Light'), findsNothing);

    // Persists across tab switches.
    await tester.tap(find.byIcon(Icons.wifi));
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.settings));
    await tester.pumpAndSettle();
    expect(scaffoldColor(), const Color(0xFFF7F7F8));
    expect(find.text('Light'), findsOneWidget); // shown as the selected value

    // Pure Black theme
    await revealAndTap(tester, settingsScroll, find.text('App Theme'));
    await tester.tap(find.text('Pure Black').last);
    await tester.pumpAndSettle();
    expect(scaffoldColor(), const Color(0xFF000000));
  });
}
