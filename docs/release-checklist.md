# RemoteLink 1.0 Release Checklist

This checklist prevents an automated build from being mistaken for a signed,
real-device-verified public release.

## Source and Privacy

- [x] Desktop and mobile versions identify as 1.0.0.
- [x] No credentials, signing keys, APKs, installers, personal machine paths, or local configuration are tracked.
- [x] Public UI and exported logs redact internal commands, local paths, protocol errors, and pairing codes.
- [x] Privacy, security, support, setup, and changelog documents are present.
- [x] Phase 6C, cloud relay, Accessibility control, ADB, and desktop-to-phone control are excluded.

## Automated Validation

- [x] Desktop dependency audit has no high-severity findings.
- [x] Desktop production build passes.
- [x] Desktop runtime opens, starts the engine, listens for pairing and discovery, and stops cleanly.
- [x] Flutter analysis passes.
- [x] Flutter tests pass.
- [x] Android debug APK builds from a clean generated-output state.

## Required Real-Device Gate

- [ ] Pair through automatic discovery on a physical Android phone.
- [ ] Pair through manual IP and reject an incorrect pairing code.
- [ ] Verify reconnect, disconnect, engine restart, and repeated pairing attempts.
- [ ] Verify mouse move, left/right/double click, drag, scroll, keyboard, modifiers, and shortcuts.
- [ ] Verify no delayed or queued input after disconnect or engine stop.
- [ ] Verify PC preview start/stop, both monitors, fullscreen, zoom, and rotate.
- [ ] Verify phone sharing start/stop, portrait/landscape rotation, desktop stop, notification removal, disconnect, and reconnect.
- [ ] Verify PC preview and phone sharing conflict messages in both directions.
- [ ] Record Windows version, Android version, device model, test date, and result without personal network details.

## Required Signing and Publication Gate

- [ ] Supply a private Android upload key through ignored local configuration.
- [ ] Supply a trusted Windows code-signing certificate outside the repository.
- [ ] Build signed Android and Windows release artifacts.
- [ ] Verify signatures, version metadata, clean-machine installation, upgrade, uninstall, and first-run firewall behavior.
- [ ] Generate SHA-256 checksums from the exact signed artifacts.
- [ ] Publish privacy and support pages at stable public URLs.
- [ ] Publish release notes and artifacts from the `main` commit that passed every gate above.

Do not mark 1.0.0 as publicly released while any required real-device or signing
item remains unchecked.
