# Setup Guide

## Connection Overview

RemoteLink focuses on a "Local Nearby Mode" first, keeping control and streaming on the local network.
There is no internet relay or cloud access. After approval, the mobile app can send real mouse and keyboard input to the paired PC.

### 1. How to find PC Local IP
Users can find their local IP address via:
- **Windows**: `ipconfig` in Command Prompt.
- **RemoteLink UI**: Turn the desktop Remote Engine ON. The desktop app displays the Recommended Host IP.

### 2. How Pairing Code works
- The Desktop main process generates a random 6-digit pairing code.
- This code is required by the mobile app to establish the initial trust relationship.

### 3. How Mobile connects to PC
- The user manually enters the PC's local IP and pairing code.
- The mobile app requests a local pairing session and waits for approval on the desktop.
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

## Version 1.0 Scope
- Mobile-to-PC mouse, keyboard, and shortcut control.
- PC-to-mobile live screen preview.
- Mobile-screen-to-PC view-only sharing.
- Trusted local Wi-Fi or personal hotspot connections only.

Input commands require an approved session and can execute OS input on Windows hosts. Use Release All Keys if Ctrl, Shift, Alt, or Win becomes stuck. Disconnecting the session stops input and streaming. Mobile screen sharing is view-only and requires explicit Android MediaProjection consent.

## Android Release Signing

For Play Store release, create a private upload keystore outside the repo and build an AAB with `flutter build appbundle --release`. Do not commit signing keys, passwords, or Play Console secrets.
Use the repository privacy and support documents as the source for public policy pages. Do not place private email addresses directly inside the app UI.
Android local network access is used only for trusted Wi-Fi or hotspot pairing.

## Windows Release Signing

Windows publishing requires a trusted code-signing certificate supplied outside this repository. Do not commit certificates, passwords, or signing service credentials.
