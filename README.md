# RemoteLink

A local-network remote control app: use your Android phone as a mouse, keyboard, and
screen viewer for your Windows PC — and mirror your phone's screen to the PC — over
your own Wi-Fi or hotspot. No cloud, no accounts, no internet relay.

## What it does

- **Pairing** — the desktop app generates a 6-digit code; the phone connects to it
  over your local network and every session requires explicit approval on the PC.
- **PC control from your phone** — touchpad-style mouse, keyboard, shortcuts, and
  modifier keys send real input to the paired Windows PC.
- **PC screen preview on your phone** — view the desktop's screen live on the phone.
- **Phone screen on your PC** — mirror the phone's screen to the desktop app
  (view-only), using Android's screen-capture permission.

Only one of "PC preview" and "phone screen sharing" can be active at a time, and the
UI is explicit about which mode is running.

## Why it's local-only

There is no cloud relay, no account system, and no internet access required or used.
Pairing is scoped to your local network, every connection needs host approval, input
messages are session-bound and rejected if stale, and diagnostic logs are sanitized
before they're shown or exported — no file paths, IPs, or internal details leak into
the UI. If that's not what you're looking for (remote access over the internet), this
project isn't for you.

## Project structure

- `apps/desktop/` — Electron + React + TypeScript host app for Windows.
- `apps/mobile/` — Flutter app for Android.
- `docs/` — setup and connection details.

## Tech stack

- **Desktop**: Electron, React, TypeScript, native Windows input via `SendInput`.
- **Mobile**: Flutter (Android only — uses `MediaProjection` for screen sharing).
- **Protocol**: JSON messages over a local WebSocket (port 47777), with UDP
  broadcast discovery (port 47778).

## Getting started

See [docs/setup.md](docs/setup.md) for pairing and connection details, and each
app's own README for build instructions:

- [apps/desktop/README.md](apps/desktop/README.md)
- [apps/mobile/README.md](apps/mobile/README.md)

Development requires Node.js 22.12 or newer for the desktop app and Flutter
3.44.1 with Java 17 for the Android app. The repository's automated checks run
the desktop build and audit, Flutter analysis and tests, and a debug APK build.

## Release status

The source is versioned for RemoteLink 1.0.0. Automated desktop and Android
checks run for every change. Public binary distribution additionally requires
final real-device regression and private release signing; signing material is
never stored in this repository.

## License

Source is shared publicly for portfolio purposes. All rights reserved — see
[LICENSE](LICENSE) before using, copying, or redistributing any part of it.

Security issues should be reported privately as described in
[SECURITY.md](SECURITY.md), not through a public issue.

Data handling is described in [PRIVACY.md](PRIVACY.md). General help and
non-security problem reports are covered by [SUPPORT.md](SUPPORT.md).
The evidence required before publishing binaries is listed in
[docs/release-checklist.md](docs/release-checklist.md).
