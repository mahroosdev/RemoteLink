# RemoteLink

A cross-platform remote control application.

## Project Structure

- `apps/desktop/`: Electron + React + TypeScript application for the host PC.
- `apps/mobile/`: Flutter application for the Android client.
- `packages/shared/`: TypeScript message schemas and protocol definitions.
- `docs/`: Documentation and setup guides.

## Tech Stack

- **Desktop**: Electron, React, TypeScript
- **Mobile**: Flutter (Android)
- **Shared**: TypeScript
- **Protocol**: Custom JSON-based message schema over WebSockets.

## Development

See [docs/setup.md](docs/setup.md) for instructions on getting started.
