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

## Status

Functional and tested locally (pairing, PC control, PC preview, and phone screen
sharing all work end to end). There's no signed release build or installer yet —
run it from source for now.

## License

Source is shared publicly for portfolio purposes. All rights reserved — see
[LICENSE](LICENSE) before using, copying, or redistributing any part of it.
