# RemoteLink Desktop

Electron + React + TypeScript host app for Windows. Runs the local pairing
server, sends real mouse/keyboard input to the OS, captures the desktop screen
for phone preview, and displays the phone's screen when sharing is active.

## Tech stack

- **Framework**: Electron
- **Frontend**: React + TypeScript, built with Vite
- **Styling**: plain CSS with custom properties (no CSS framework)
- **Windows input**: `SendInput` via a persistent PowerShell worker process

## Getting started

### Prerequisites
- Node.js 22.12 or newer
- npm
- Windows, for real mouse/keyboard input and the Windows Firewall repair flow
  (the UI itself runs cross-platform, but those two features are Windows-only)

### Install
```bash
cd apps/desktop
npm ci
```

### Development
Runs Vite and Electron together with hot reload:
```bash
npm run electron:dev
```

### Build
Type-checks and builds the renderer and Electron main/preload bundles:
```bash
npm run build
```

### Validate dependencies
```bash
npm audit --audit-level=high
```

## What's implemented

- Local pairing: 6-digit code, host approval required, session-bound WebSocket
  connection with rate-limited pairing attempts.
- Real mouse, keyboard, shortcuts, and modifier-key input sent to Windows via
  `SendInput` (with a fallback path if the primary worker is unavailable).
- Local desktop screen preview streamed to the paired phone.
- Phone screen viewer: displays the phone's screen when the phone starts
  sharing (view-only).
- Local network diagnostics: recommended host IP, UDP discovery listener, and
  a Windows Firewall status/repair flow scoped to this app's local ports.
- Activity log with sanitized, public-safe event text (no file paths, raw
  errors, or protocol internals shown in the UI).

## Not implemented

There's no packaged installer yet — run it from source. No cloud/relay mode,
no desktop-to-phone control, no Android Accessibility Service, no ADB.
