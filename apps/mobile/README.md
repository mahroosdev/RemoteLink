# RemoteLink Mobile

Flutter client for Android. Pairs with the RemoteLink desktop app over the
local network, sends mouse/keyboard input, shows the PC's screen preview, and
can share the phone's own screen to the PC.

## What's implemented

- **Connect screen**: manual host IP + pairing code entry, or scan for local
  desktop hosts via UDP discovery.
- **Touchpad + controls**: relative-move touchpad, click/drag, scroll,
  keyboard, shortcuts, and a modifier toolbar (Ctrl/Alt/Shift/Win, with
  tap-to-hold and long-press-to-stick behavior).
- **PC screen preview**: live view of the desktop's screen with zoom, pan,
  rotate, and fullscreen.
- **Phone screen sharing**: shares this phone's screen to the paired desktop
  (view-only) using Android's `MediaProjection` screen-capture permission, via
  a foreground service with a persistent notification while active.

PC preview and phone screen sharing are mutually exclusive — starting one
stops the other, with a clear status message either way.

## Getting started

Use Flutter 3.44.1 and Java 17.

```bash
cd apps/mobile
flutter pub get
flutter run
```

Validate the app with:

```bash
flutter analyze
flutter test
flutter build apk --debug
```

Local pairing connects to `ws://HOST_IP:47777` on your LAN, so Android
cleartext (non-TLS) traffic is intentionally enabled for local-network use —
this app has no internet/cloud connectivity.

## Developer notes

Capture a phone startup crash:
```powershell
adb logcat -c
adb logcat | findstr RemoteLink
```

Release signing is intentionally not configured in this repository. Supply a
private upload keystore outside the repo and add a local signing configuration
before publishing. Do not commit signing keys, passwords, or store credentials.
The repository privacy and support documents are the source for public policy
pages.

Copy `android/key.properties.example` to `android/key.properties`, replace every
placeholder with private local values, and keep the real file outside Git. A
release build remains unsigned when `key.properties` is absent.
