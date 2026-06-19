import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:remotelink_mobile/app.dart';
import 'package:remotelink_mobile/models/app_state.dart';
import 'package:remotelink_mobile/screens/fullscreen_preview_screen.dart';
import 'package:remotelink_mobile/screens/remote_control_screen.dart';
import 'package:remotelink_mobile/screens/settings_screen.dart';
import 'package:remotelink_mobile/services/pairing_service.dart';
import 'package:remotelink_mobile/services/protocol.dart';
import 'package:remotelink_mobile/theme/app_theme.dart';
import 'package:remotelink_mobile/widgets/app_logo.dart';
import 'package:remotelink_mobile/widgets/touchpad_area.dart';

class FakePairingService extends PairingService {
  final _events = StreamController<PairingEvent>.broadcast();
  final List<String> commands = [];
  final List<String> selectedMonitorIds = [];
  final List<String> hostIps = [];
  final List<String> pairingCodes = [];
  final Set<String> failingHostIps;
  int connectCalls = 0;
  int disconnectCalls = 0;

  FakePairingService({this.failingHostIps = const {}});

  @override
  Stream<PairingEvent> get events => _events.stream;

  @override
  Future<void> connect(String hostIp, String pairingCode) async {
    connectCalls += 1;
    hostIps.add(hostIp);
    pairingCodes.add(pairingCode);
    if (failingHostIps.contains(hostIp)) {
      scheduleMicrotask(() {
        _events.add(PairingEvent(
          MessageTypes.error,
          message: 'Cannot reach desktop engine at ws://$hostIp:47777',
        ));
      });
      return;
    }
    const monitors = [
      RemoteMonitor(id: 'screen-1', label: 'Screen 1', isPrimary: true),
      RemoteMonitor(id: 'screen-2', label: 'Screen 2', isPrimary: false),
    ];

    scheduleMicrotask(() {
      _events.add(const PairingEvent(MessageTypes.pairingPending,
          message: 'Waiting for PC approval'));
      _events.add(const PairingEvent(
        MessageTypes.pairingApproved,
        sessionId: 'test-session',
        monitors: monitors,
        selectedMonitorId: 'screen-1',
      ));
      _events.add(
          const PairingEvent(MessageTypes.monitorList,
              monitors: monitors, selectedMonitorId: 'screen-1'));
    });
  }

  @override
  bool sendCommandLog(String command, Map<String, dynamic> details) {
    commands.add(command);
    return true;
  }

  @override
  bool selectMonitor(String monitorId) {
    selectedMonitorIds.add(monitorId);
    return true;
  }

  @override
  Future<void> disconnect({bool sendMessage = true}) async {
    disconnectCalls += 1;
  }

  @override
  Future<void> dispose() async {
    await _events.close();
  }
}

class AppHarness {
  final AppState state;
  final FakePairingService service;

  const AppHarness({required this.state, required this.service});
}

void main() {
  // Phone-sized surface so RenderFlex overflows fail these tests.
  Future<AppHarness> pumpApp(WidgetTester tester,
      {FakePairingService? pairingService}) async {
    tester.view.physicalSize = const Size(375, 812);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    final service = pairingService ?? FakePairingService();
    final state = AppState(pairingService: service);
    addTearDown(state.dispose);
    await tester.pumpWidget(RemoteLinkApp(state: state));
    return AppHarness(state: state, service: service);
  }

  // Lets pending snackbars expire so they stop blocking taps near the bottom.
  Future<void> clearSnackbars(WidgetTester tester) async {
    await tester.pump(const Duration(seconds: 3));
    await tester.pumpAndSettle();
  }

  Future<void> connect(WidgetTester tester) async {
    await tester.enterText(
        find.widgetWithText(TextField, 'PC Host IP'), '127.0.0.1');
    await tester.enterText(
        find.widgetWithText(TextField, 'Pairing Code'), '123456');
    await tester.tap(find.text('Connect to PC'));
    await tester.pump(const Duration(milliseconds: 900));
    await tester.pumpAndSettle();
    await clearSnackbars(tester);
  }

  Finder scrollableIn(Type screen) => find
      .descendant(of: find.byType(screen), matching: find.byType(Scrollable))
      .first;

  Future<void> revealAndTap(
      WidgetTester tester, Finder scrollable, Finder target) async {
    await tester.scrollUntilVisible(target, 100, scrollable: scrollable);
    // Pull the target away from the viewport edge so the tap lands cleanly.
    await tester.drag(scrollable, const Offset(0, -100));
    await tester.pumpAndSettle();
    await tester.tap(target);
    await tester.pumpAndSettle();
  }

  Matcher closeToOffset(Offset expected, double tolerance) => predicate<Offset>(
        (actual) => (actual - expected).distance <= tolerance,
        'within $tolerance px of $expected',
      );

  testWidgets('boots to Connect screen and tabs switch', (tester) async {
    final harness = await pumpApp(tester);

    expect(find.text('REMOTELINK'), findsOneWidget);
    expect(find.text('PRO UTILITY'), findsOneWidget);
    expect(find.text('Connect to PC'), findsOneWidget);
    expect(find.text('DISCONNECTED'), findsOneWidget);
    expect(find.text('Scanning local network...'), findsNothing);
    expect(harness.service.connectCalls, 0);
    expect(find.byType(AppLogo), findsOneWidget);
    expect(
        find.descendant(of: find.byType(AppLogo), matching: find.byType(Image)),
        findsNothing);

    await tester.tap(find.byIcon(Icons.book));
    await tester.pumpAndSettle();
    expect(find.text('Application Manual'), findsOneWidget);
  });

  testWidgets('scan finds nothing honestly and never fills the IP',
      (tester) async {
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

    await tester.enterText(
        find.widgetWithText(TextField, 'PC Host IP'), '192.168.0.24');
    await tester.enterText(
        find.widgetWithText(TextField, 'Pairing Code'), '123');
    await tester.tap(find.text('Connect to PC'));
    await tester.pumpAndSettle();
    expect(find.textContaining('must be exactly 6 digits'), findsOneWidget);
  });

  testWidgets('bad virtual IP warns but retry uses latest clean host IP',
      (tester) async {
    final service = FakePairingService(failingHostIps: {'192.168.56.1'});
    final harness = await pumpApp(tester, pairingService: service);

    await tester.enterText(
        find.widgetWithText(TextField, 'PC Host IP'), '192.168.56.1');
    await tester.pumpAndSettle();
    expect(find.textContaining('virtual or local-only IP'), findsOneWidget);
    await tester.enterText(
        find.widgetWithText(TextField, 'Pairing Code'), '123456');
    await tester.tap(find.text('Connect to PC'));
    await tester.pumpAndSettle();

    expect(harness.state.status, ConnectionStatus.failed);
    expect(harness.state.isConnected, isFalse);
    expect(
        find.textContaining(
            'Cannot reach desktop engine at ws://192.168.56.1:47777'),
        findsOneWidget);
    await clearSnackbars(tester);

    await tester.enterText(
        find.widgetWithText(TextField, 'PC Host IP'), ' 10.188.224.43 ');
    await tester.enterText(
        find.widgetWithText(TextField, 'Pairing Code'), ' 654321 ');
    await tester.tap(find.text('Connect to PC'));
    await tester.pumpAndSettle();

    expect(harness.state.isConnected, isTrue);
    expect(harness.state.hostIp, '10.188.224.43');
    expect(harness.state.pairingCode, '654321');
    expect(service.hostIps, ['192.168.56.1', '10.188.224.43']);
    expect(service.pairingCodes, ['123456', '654321']);
    expect(service.disconnectCalls, greaterThanOrEqualTo(2));
  });

  testWidgets('valid connect navigates to Remote and detects monitors',
      (tester) async {
    final harness = await pumpApp(tester);

    // Offline: no monitor buttons, just the detection hint.
    await tester.tap(find.byIcon(Icons.settings_remote));
    await tester.pumpAndSettle();
    expect(find.text('Connect to PC to load screens'), findsOneWidget);
    expect(find.text('Screen 1'), findsNothing);
    expect(find.text('STREAM OFFLINE'), findsOneWidget);
    await tester.tap(find.byIcon(Icons.wifi));
    await tester.pumpAndSettle();

    await connect(tester);

    expect(find.text('Connected'), findsOneWidget);
    expect(find.textContaining('WAITING FOR STREAM'), findsOneWidget);
    expect(find.text('12MS'), findsOneWidget);
    // Mock detection reports 2 monitors → exactly Screen 1 and Screen 2.
    expect(
        find.text('Connect to PC to load screens'), findsNothing);
    expect(find.text('Screen 1'), findsOneWidget);
    expect(find.text('Screen 2'), findsOneWidget);
    expect(find.text('Screen 3'), findsNothing);

    // Switching monitors updates the preview label.
    await tester.tap(find.text('Screen 2'));
    await tester.pump();
    expect(find.textContaining('SCREEN 2'), findsOneWidget);
    expect(find.byType(SnackBar), findsNothing);
    expect(harness.service.selectedMonitorIds, ['screen-2']);
    expect(harness.service.commands, isNot(contains('monitor_switch')));
  });

  testWidgets('touchpad logs pointer movement and pointer toggle works',
      (tester) async {
    final harness = await pumpApp(tester);
    await connect(tester);

    expect(tester.widget<TouchpadArea>(find.byType(TouchpadArea)).showPointer,
        isTrue);
    await tester.drag(find.byType(TouchpadArea), const Offset(40, 25));
    await tester.pumpAndSettle();
    expect(harness.service.commands, contains('touchpad_move'));
    expect(find.text('Pointer moved'), findsNothing);

    // Settings > Controls: Show Touchpad Pointer toggles and persists.
    await tester.tap(find.byIcon(Icons.settings));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('Show Touchpad Pointer'), 100,
        scrollable: scrollableIn(SettingsScreen));
    await tester.tap(find.text('Show Touchpad Pointer'));
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.settings_remote));
    await tester.pumpAndSettle();
    expect(tester.widget<TouchpadArea>(find.byType(TouchpadArea)).showPointer,
        isFalse);
  });

  testWidgets('normal Remote tab stays portrait with restored tool tabs',
      (tester) async {
    await pumpApp(tester);

    await tester.tap(find.byIcon(Icons.settings_remote));
    await tester.pumpAndSettle();

    expect(find.text('PORTRAIT PREVIEW'), findsNothing);
    expect(find.text('LANDSCAPE PREVIEW'), findsNothing);
    expect(find.text('Force Landscape'), findsNothing);
    expect(find.text('Force Portrait'), findsNothing);
    expect(find.text('Fullscreen Preview'), findsOneWidget);
    expect(find.byIcon(Icons.screen_rotation), findsOneWidget);
    expect(find.text('Mouse'), findsOneWidget);
    expect(find.text('Keyboard'), findsOneWidget);
    expect(find.text('Shortcuts'), findsOneWidget);
    expect(find.byType(TouchpadArea), findsOneWidget);
    expect(find.text('Left Click'), findsOneWidget);
    expect(find.text('Scroll Down'), findsOneWidget);
    expect(find.text('Basic Keys'), findsNothing);

    await tester.tap(find.text('Keyboard'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(TextField, 'Type to PC...'), findsOneWidget);
    expect(find.text('Basic Keys'), findsOneWidget);
    expect(find.text('Modifiers'), findsOneWidget);
    expect(find.text('Actions'), findsNothing);
    expect(find.text('Function Keys'), findsNothing);

    await tester.tap(find.text('Shortcuts'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(TextField, 'Type to PC...'), findsNothing);
    expect(find.text('Basic Keys'), findsNothing);
    expect(find.text('Modifiers'), findsNothing);
    expect(find.text('Actions'), findsOneWidget);
    expect(find.text('Function Keys'), findsOneWidget);

    // Tab switches do not reveal or persist any normal-page landscape state.
    await tester.tap(find.byIcon(Icons.wifi));
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.settings_remote));
    await tester.pumpAndSettle();
    expect(find.text('PORTRAIT PREVIEW'), findsNothing);
    expect(find.text('LANDSCAPE PREVIEW'), findsNothing);
    expect(find.text('Force Landscape'), findsNothing);
    expect(find.text('Mouse'), findsOneWidget);
  });

  testWidgets('fullscreen preview opens, rotates manually, and closes',
      (tester) async {
    final harness = await pumpApp(tester);
    final platformCalls = <MethodCall>[];
    final messenger =
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
    messenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
      platformCalls.add(call);
      return null;
    });
    addTearDown(() {
      messenger.setMockMethodCallHandler(SystemChannels.platform, null);
    });

    await tester.tap(find.byIcon(Icons.settings_remote));
    await tester.pumpAndSettle();
    platformCalls.clear();

    await tester.tap(find.text('Fullscreen Preview'));
    await tester.pumpAndSettle();

    expect(find.byType(FullscreenPreviewScreen), findsOneWidget);
    final inFullscreen = find.byType(FullscreenPreviewScreen);
    expect(find.text('LANDSCAPE PREVIEW'), findsNothing);
    expect(find.text('PORTRAIT PREVIEW'), findsNothing);
    expect(find.text('STREAM OFFLINE'), findsOneWidget);
    expect(find.byType(BottomNavigationBar), findsNothing);
    expect(
        find.descendant(of: inFullscreen, matching: find.byType(AspectRatio)),
        findsNothing);
    final placeholder =
        find.byKey(const ValueKey('fullscreen-preview-placeholder'));
    expect(placeholder, findsOneWidget);
    expect(
      tester.getCenter(placeholder),
      closeToOffset(tester.getCenter(inFullscreen), 1),
    );

    List<List<String>> orientationCalls() => platformCalls
        .where((call) => call.method == 'SystemChrome.setPreferredOrientations')
        .map((call) => List<String>.from(call.arguments as List))
        .toList();

    expect(orientationCalls().last, [
      'DeviceOrientation.landscapeLeft',
      'DeviceOrientation.landscapeRight',
    ]);

    // Manual rotate changes the actual fullscreen route orientation.
    final rotate = find.descendant(
        of: inFullscreen, matching: find.byIcon(Icons.screen_rotation));
    await tester.tap(rotate);
    await tester.pumpAndSettle();
    expect(find.text('PORTRAIT PREVIEW'), findsNothing);
    expect(find.text('LANDSCAPE PREVIEW'), findsNothing);
    expect(find.text('STREAM OFFLINE'), findsOneWidget);
    expect(orientationCalls().last, ['DeviceOrientation.portraitUp']);
    expect(
      tester.getCenter(placeholder),
      closeToOffset(tester.getCenter(inFullscreen), 1),
    );
    expect(find.byType(SnackBar), findsNothing);
    expect(harness.service.commands, isEmpty);

    await tester.tap(rotate);
    await tester.pumpAndSettle();
    expect(find.text('LANDSCAPE PREVIEW'), findsNothing);
    expect(find.text('PORTRAIT PREVIEW'), findsNothing);
    expect(find.text('STREAM OFFLINE'), findsOneWidget);
    expect(orientationCalls().last, [
      'DeviceOrientation.landscapeLeft',
      'DeviceOrientation.landscapeRight',
    ]);
    expect(
      tester.getCenter(placeholder),
      closeToOffset(tester.getCenter(inFullscreen), 1),
    );

    // Close restores portrait before returning to the normal Remote screen.
    await tester.tap(
        find.descendant(of: inFullscreen, matching: find.byIcon(Icons.close)));
    await tester.pumpAndSettle();
    expect(find.byType(FullscreenPreviewScreen), findsNothing);
    expect(orientationCalls().last, ['DeviceOrientation.portraitUp']);
    expect(find.text('PORTRAIT PREVIEW'), findsNothing);
    expect(find.text('Force Landscape'), findsNothing);
  });

  testWidgets(
      'app stays in portrait mode with bottom nav even on landscape device',
      (tester) async {
    tester.view.physicalSize = const Size(812, 375);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    final state = AppState(pairingService: FakePairingService());
    addTearDown(state.dispose);
    await tester.pumpWidget(RemoteLinkApp(state: state));

    expect(find.byType(NavigationRail), findsNothing);
    expect(find.byType(BottomNavigationBar), findsOneWidget);

    await tester.tap(find.byIcon(Icons.settings_remote));
    await tester.pumpAndSettle();

    // Normal Remote stays portrait-only even if the test surface is wide.
    expect(find.text('PORTRAIT PREVIEW'), findsNothing);
    expect(find.text('LANDSCAPE PREVIEW'), findsNothing);
    expect(find.text('Force Landscape'), findsNothing);
    expect(find.text('Mouse'), findsOneWidget);
    expect(find.text('Keyboard'), findsOneWidget);
    expect(find.text('Shortcuts'), findsOneWidget);
    final remoteScroll = scrollableIn(RemoteControlScreen);
    await tester.scrollUntilVisible(find.text('Keyboard'), 100,
        scrollable: remoteScroll);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Keyboard'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('Esc'), 100,
        scrollable: remoteScroll);
    await tester.pumpAndSettle();
    expect(find.widgetWithText(TextField, 'Type to PC...'), findsOneWidget);
    expect(find.text('Esc'), findsOneWidget);

    // Settings uses bottom navigation
    await tester.tap(find.byIcon(Icons.settings));
    await tester.pumpAndSettle();
    final firstSwitch = find.byType(Switch).first;
    expect(tester.widget<Switch>(firstSwitch).value, isTrue);
    await tester.tap(firstSwitch);
    await tester.pumpAndSettle();
    expect(tester.widget<Switch>(firstSwitch).value, isFalse);
  });

  testWidgets(
      'remote controls give feedback and panels expand without overflow',
      (tester) async {
    final harness = await pumpApp(tester);
    await connect(tester);

    final remoteScroll = scrollableIn(RemoteControlScreen);

    await revealAndTap(tester, remoteScroll, find.text('Left Click'));
    expect(harness.service.commands, contains('left_click'));
    expect(find.text('Left click sent'), findsNothing);
    expect(find.byType(SnackBar), findsNothing);
    await clearSnackbars(tester);

    await revealAndTap(tester, remoteScroll, find.text('Scroll Down'));
    expect(harness.service.commands, contains('scroll_down'));
    expect(find.text('Scroll down sent'), findsNothing);

    // The 2x2 grid has exactly four buttons; the old Middle button is gone.
    expect(find.text('Middle'), findsNothing);

    await tester.scrollUntilVisible(find.text('Keyboard'), 100,
        scrollable: remoteScroll);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Keyboard'));
    await tester.pumpAndSettle();

    // Basic Keys panel is expanded by default.
    await revealAndTap(tester, remoteScroll, find.text('Esc'));
    expect(harness.service.commands, contains('key'));
    expect(find.text('Esc sent'), findsNothing);
    expect(find.text('Actions'), findsNothing);
    expect(find.text('Function Keys'), findsNothing);

    // Modifiers panel: expand, hold Ctrl, release all.
    await revealAndTap(tester, remoteScroll, find.text('Modifiers'));
    await tester.scrollUntilVisible(find.text('Ctrl'), 100,
        scrollable: remoteScroll);
    await tester.pumpAndSettle();
    final modifierTopBefore = tester.getTopLeft(find.text('Modifiers')).dy;
    await tester.tap(find.text('Ctrl'));
    await tester.pumpAndSettle();
    expect(tester.getTopLeft(find.text('Modifiers')).dy, modifierTopBefore);
    expect(harness.service.commands, contains('key'));
    expect(find.text('Held Ctrl'), findsNothing);
    expect(find.text('1 HELD'), findsOneWidget);
    await revealAndTap(tester, remoteScroll, find.text('Release All Keys'));
    expect(harness.service.commands, contains('release_all_keys'));
    expect(find.text('All virtual keys released'), findsNothing);
    expect(find.text('1 HELD'), findsNothing);

    await tester.scrollUntilVisible(find.text('Shortcuts'), 100,
        scrollable: remoteScroll);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Shortcuts'));
    await tester.pumpAndSettle();
    expect(find.text('Basic Keys'), findsNothing);
    expect(find.text('Modifiers'), findsNothing);

    // Actions panel: expand and use one.
    await revealAndTap(tester, remoteScroll, find.text('Actions'));
    await revealAndTap(tester, remoteScroll, find.text('Alt+Tab'));
    expect(harness.service.commands, contains('shortcut'));
    expect(find.text('Alt+Tab (Alt+Tab) sent'), findsNothing);

    // Function Keys panel: expand; with all four panels open, scrolling to F12
    // is the worst-case overflow check.
    await revealAndTap(tester, remoteScroll, find.text('Function Keys'));
    await tester.scrollUntilVisible(find.text('F12'), 100,
        scrollable: remoteScroll);
    expect(find.text('F1'), findsOneWidget);
    expect(find.text('F12'), findsOneWidget);
  });

  testWidgets('disconnected controls give honest feedback and send no commands',
      (tester) async {
    final harness = await pumpApp(tester);

    await tester.tap(find.byIcon(Icons.settings_remote));
    await tester.pumpAndSettle();

    final remoteScroll = scrollableIn(RemoteControlScreen);

    await revealAndTap(tester, remoteScroll, find.text('Left Click'));
    expect(find.text('Connect to PC first'), findsAtLeastNWidgets(1));
    expect(find.text('Left click sent'), findsNothing);
    expect(harness.service.commands, isEmpty);

    await tester.scrollUntilVisible(find.text('Keyboard'), 100,
        scrollable: remoteScroll);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Keyboard'));
    await tester.pumpAndSettle();
    await revealAndTap(tester, remoteScroll, find.text('Esc'));
    expect(find.text('Connect to PC first'), findsAtLeastNWidgets(1));
    expect(find.text('Esc sent'), findsNothing);
    expect(harness.service.commands, isEmpty);

    await revealAndTap(tester, remoteScroll, find.text('Modifiers'));
    await revealAndTap(tester, remoteScroll, find.text('Ctrl'));
    expect(find.text('Connect to PC first'), findsAtLeastNWidgets(1));
    expect(find.text('1 HELD'), findsNothing);
    expect(harness.state.heldModifiers, isEmpty);
    expect(harness.service.commands, isEmpty);
  });

  testWidgets('typing to PC logs and clears, empty send warns in ticker',
      (tester) async {
    final harness = await pumpApp(tester);
    await connect(tester);

    await tester.tap(find.text('Keyboard'));
    await tester.pumpAndSettle();

    // Empty send: in-page ticker warning, no SnackBar (taps must not flash).
    await tester.ensureVisible(find.byIcon(Icons.send_rounded));
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.send_rounded));
    await tester.pumpAndSettle();
    expect(find.textContaining('Nothing to send'), findsOneWidget);
    expect(find.byType(SnackBar), findsNothing);

    await tester.enterText(
        find.widgetWithText(TextField, 'Type to PC...'), 'hello world');
    await tester.ensureVisible(find.byIcon(Icons.send_rounded));
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.send_rounded));
    await tester.pump();
    expect(harness.service.commands, contains('text'));
    expect(find.text('Sent text: hello world'), findsNothing);
    expect(find.byType(SnackBar), findsNothing);
    expect(find.widgetWithText(TextField, 'hello world'), findsNothing);
  });

  testWidgets('settings change and persist across tab switches',
      (tester) async {
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

  testWidgets('theme selector switches the real app theme and persists',
      (tester) async {
    await pumpApp(tester);

    Color scaffoldColor() => tester
        .widget<MaterialApp>(find.byType(MaterialApp))
        .theme!
        .scaffoldBackgroundColor;

    expect(
        scaffoldColor(), const Color(0xFF0B0C0F)); // Professional Dark default

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

  test('theme and settings restore from persisted preferences', () async {
    SharedPreferences.setMockInitialValues({});

    final state = await AppState.create(pairingService: FakePairingService());
    state.setThemeMode(AppTheme.lightMode);
    state.setShowTouchpadPointer(false);
    state.setStreamResolution('720p');
    state.setFrameRate('30 FPS');
    state.setTouchpadMode('Gaming Mode');
    state.setMouseSensitivity(72);
    state.setScrollVelocity(33);
    await Future<void>.delayed(Duration.zero);
    state.dispose();

    final restored =
        await AppState.create(pairingService: FakePairingService());
    addTearDown(restored.dispose);

    expect(restored.themeMode.value, AppTheme.lightMode);
    expect(restored.showTouchpadPointer.value, isFalse);
    expect(restored.streamResolution.value, '720p');
    expect(restored.frameRate.value, '30 FPS');
    expect(restored.touchpadMode.value, 'Gaming Mode');
    expect(restored.mouseSensitivity.value, 72);
    expect(restored.scrollVelocity.value, 33);
  });
}
