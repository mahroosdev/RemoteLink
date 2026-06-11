# Remote Link Mobile App

Flutter Android client application.

## Release Notes

For Play Store release, create a private upload keystore outside the repo and build an AAB with `flutter build appbundle --release`.
Do not commit signing keys, passwords, or Play Console secrets.

Local Phase 2 pairing uses `ws://HOST_IP:47777` on the user's LAN, so Android cleartext traffic is intentionally enabled for local WebSocket pairing.

## UI Plan
- **Discovery Screen**: Scans for local PC hosts.
- **Control Pad**: Touchpad area for mouse control and virtual keyboard.
- **Modifier Toolbar**: Access to Ctrl, Alt, Shift, and Function keys.
- **Screen Selector**: Thumbnails of available PC monitors.
