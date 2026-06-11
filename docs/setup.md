# Setup Guide & Protocol Documentation

## Connection Overview

RemoteLink focuses on a "Local Nearby Mode" first, ensuring a fast and secure connection within the same network.

### 1. How to find PC Local IP
Users can find their local IP address via:
- **Windows**: `ipconfig` in Command Prompt.
- **RemoteLink UI**: The desktop app will display the detected local IP on the main dashboard (example format only: `192.168.0.24`).

### 2. How Pairing Code works
- The Desktop app generates a random 6-digit pairing code.
- This code is required by the mobile app to establish the initial trust relationship.

### 3. How Mobile connects to PC
- The mobile app scans the local network for the Desktop app's port or the user manually enters the PC's local IP.
- Once the IP is identified, the mobile app sends a connection request.

### 4. How PC approves the connection
- When a mobile device attempts to connect, a popup appears on the Desktop app.
- The user must enter the pairing code displayed on the mobile device or click "Approve" on the Desktop UI.

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
  "type": "MOUSE_MOVE",
  "payload": {
    "x": 100,
    "y": 200
  }
}
```
