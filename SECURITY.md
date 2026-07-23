# Security Policy

RemoteLink controls desktop input and streams screens across a local network.
Security reports should therefore be handled privately until a fix is ready.

## Supported Version

Security fixes are applied to the latest 1.x source on the `main` branch. A
binary is supported only when it is published through this repository's
official Releases page with a checksum.

## Reporting a Vulnerability

Use GitHub's private vulnerability reporting for this repository:

https://github.com/mahroosdev/RemoteLink/security/advisories/new

Include the affected component, reproduction steps, expected impact, and any
suggested mitigation. Do not include pairing codes, private IP addresses,
screen captures, signing material, or personal data unless they are essential
to reproduce the issue.

Please do not open a public issue for an unpatched vulnerability.

## Security Boundaries

RemoteLink is designed for trusted local Wi-Fi or a personal hotspot. It does
not provide cloud relay or internet-wide access. Pairing approval on the host
and Android screen-capture consent must remain enabled.

Version 1.0 uses a cleartext local WebSocket connection. The pairing code,
desktop approval, and session validation restrict control access, but they do
not encrypt screen or input traffic against an attacker who can observe the
local network. Use a trusted private network or personal hotspot, never approve
an unknown phone, and disconnect when finished.

The Windows Firewall repair action is limited to the RemoteLink executable,
TCP port 47777, UDP discovery port 47778, and the local subnet. Do not replace
these rules with unrestricted public-network access.
