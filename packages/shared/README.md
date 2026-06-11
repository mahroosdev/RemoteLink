# RemoteLink Shared Protocol

This package defines the TypeScript interfaces for messages exchanged between the Desktop and Mobile apps.
The active Phase 1 protocol lives in `src/protocol.ts`.

## Message Types
- `pairing_request`
- `pairing_pending`
- `pairing_approved`
- `pairing_denied`
- `heartbeat`
- `monitor_list`
- `command_log`
- `disconnect`
- `error`
