# RemoteLink Privacy

Effective date: July 18, 2026

RemoteLink connects an Android phone and a Windows PC over a trusted local
network or personal hotspot. The project does not provide accounts, advertising,
analytics, cloud storage, or an internet relay.

## Data Processed

RemoteLink processes the following data only to provide its local features:

- A local network address used to connect the phone and PC.
- A temporary pairing code and session identifier.
- Device name and app version shown during pairing.
- Mouse, keyboard, and shortcut commands sent to the approved PC.
- PC preview frames sent to the paired phone when preview is active.
- Phone screen frames sent to the paired PC after Android screen-capture consent.
- Short local activity and diagnostic messages shown inside the apps.

## Storage and Transmission

Pairing, control, and screen data travel directly between the phone and PC on
the local network. RemoteLink does not send this data to a RemoteLink cloud
service. Screen frames are used for the active session and are not saved by the
application. Pairing approval is required on the PC for each new session.

RemoteLink stores user-selected app settings locally on the device where the
setting was changed. The app does not sell or share user data.

## User Controls

Users can stop preview or phone screen sharing at any time, disconnect the
session, stop the desktop engine, or close either app. Android displays a
foreground notification while phone screen sharing is active.

## Security

RemoteLink is intended for trusted private Wi-Fi or a personal hotspot. Do not
approve unknown devices or use the app on an untrusted network. Security reports
should follow [SECURITY.md](SECURITY.md).

## Changes

Material privacy changes will be documented in this file and in the project
release notes.
