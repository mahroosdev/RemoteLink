# Security Policy

RemoteLink controls desktop input and streams screens across a local network.
Security reports should therefore be handled privately until a fix is ready.

## Supported Version

Security fixes are applied to the latest commit on the `main` branch. No signed
public release is currently supported.

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
