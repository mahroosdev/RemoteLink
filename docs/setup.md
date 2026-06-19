# Setup Guide & Protocol Documentation

## Connection Overview

RemoteLink focuses on a "Local Nearby Mode" first, ensuring a fast and secure connection within the same network.
Phase 1 uses local WebSocket pairing only. There is no internet relay, no hidden access, and no real mouse/keyboard execution.

### 1. How to find PC Local IP
Users can find their local IP address via:
- **Windows**: `ipconfig` in Command Prompt.
- **RemoteLink UI**: Turn the desktop Remote Engine ON. The desktop app displays the detected local IP and listens on port `47777`.

### 2. How Pairing Code works
- The Desktop main process generates a random 6-digit pairing code.
- This code is required by the mobile app to establish the initial trust relationship.

### 3. How Mobile connects to PC
- The user manually enters the PC's local IP and pairing code.
- The mobile app connects to `ws://HOST_IP:47777` and sends a `pairing_request`.
- Scanning remains clearly separated from real pairing and does not fabricate desktops.
- For a real Android phone, use the desktop app's **Recommended Host IP** from the same Wi-Fi network as the phone.
- Avoid VirtualBox, VMware, WSL, Docker, vEthernet, Bluetooth, and other virtual adapter IPs for real phone pairing.

### 4. How PC approves the connection
- When a mobile device attempts to connect with the correct code, a pending request appears on the Desktop app.
- The desktop user must click Approve before the mobile app becomes connected.
- Windows Firewall may ask for permission; allow access on private/local networks only.
- If the phone cannot connect, try another detected LAN IP from the desktop list.

### 5. How Screen Switching works
- RemoteLink supports multiple monitors.
- The mobile UI features a "Screen Switcher" icon that allows the user to toggle between available displays detected by the Desktop host.

### 6. How Long-Press Modifier Keys work
- To simulate complex shortcuts (e.g., Ctrl+C), the mobile app uses "sticky" modifier keys.
- Tapping a modifier (Ctrl, Alt, Shift) toggles its state.
- Long-pressing a modifier keeps it active until the next primary key is pressed.

## Roadmap
- **Phase 1**: Local Nearby Mode (Current Focus).
- **Phase 2**: Worldwide Remote Mode (Future Plan - requires relay server/STUN/TURN).

## Protocol Specification
Messages are exchanged as JSON objects over WebSockets.

### Example Message:
```json
{
  "type": "command_log",
  "payload": {
    "command": "left_click",
    "details": {}
  }
}
```

Phase 1 command messages are logged by the desktop only. They do not execute OS input.

## Play Store Release Prep

For Play Store release, create a private upload keystore outside the repo and build an AAB with `flutter build appbundle --release`. Do not commit signing keys, passwords, or Play Console secrets.
Before Play Store release, create a public privacy policy URL and support page. Do not place private email addresses directly inside the app UI.
Android cleartext traffic is intentionally enabled for local `ws://HOST_IP:47777` LAN pairing.

## Microsoft Store Prep

Windows publishing will need a packaged desktop build later.
Prepare privacy policy and support page URLs before Microsoft Store submission.
Do not add personal email addresses inside the app UI.
