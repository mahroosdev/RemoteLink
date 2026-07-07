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

```bash
cd apps/mobile
flutter pub get
flutter run
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

For Play Store release, create a private upload keystore outside the repo and
build an AAB with `flutter build appbundle --release`. Do not commit signing
keys, passwords, or Play Console secrets. Create a public privacy policy URL
and support page before release, and don't place personal email addresses
directly in the app UI.
