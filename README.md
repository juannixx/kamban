# Kamban

A personal Kanban desktop app for to-dos, side projects and daily routines. It runs locally on macOS, with no account and no server: your data lives in a JSON file in a folder you choose (for example, iCloud Drive).

## Features

- **Boards and columns:** create boards with custom columns and move cards with drag and drop
- **Cards:** due dates, Markdown descriptions and checklists
- **Today view:** the day's habits, overdue cards and cards due today in one place
- **Habits:** mark habits as done each day, with history kept
- **Google Calendar (optional):** shows the day's events from one or more Google accounts on the Today view, read only. Each account can show full details or just busy blocks
- **Safe persistence:** debounced saves, automatic backups and restore, so a crash or a corrupted file does not lose data

## Tech stack

| Layer | Tools |
|---|---|
| Desktop shell | Tauri 2 (Rust) |
| UI | React, TypeScript, Tailwind CSS, dnd-kit |
| State and validation | Zustand, Zod |
| Google integration | OAuth 2.0 with PKCE in Rust, tokens stored in the macOS Keychain |
| Tests | Vitest, Testing Library |
| CI/CD | GitHub Actions: type check, lint, tests and build on every push and PR; `.dmg` installer built on every version tag |

## Architecture

```
src/
├── domain/       # pure business rules (boards, cards, columns, habits, today, agenda), unit tested
├── persistence/  # load, save scheduler, backups and restore over an abstract file system
├── platform/     # adapters for Tauri: clock, data folder, settings, Google Calendar
├── store/        # app state (Zustand)
└── ui/           # React components
src-tauri/
└── src/google/   # OAuth with PKCE, Google Calendar API client, Keychain storage
```

The domain layer has no dependency on React or Tauri, which keeps the rules easy to test and the UI thin.

## Getting started

Requirements: Node.js, pnpm and the Rust toolchain ([Tauri prerequisites](https://tauri.app/start/prerequisites/)).

```bash
pnpm install
pnpm tauri dev      # run the desktop app
pnpm test           # unit tests
pnpm lint && pnpm typecheck
```

To enable Google Calendar, follow [docs/google-calendar-setup.md](docs/google-calendar-setup.md) and fill in `src-tauri/.env` from `src-tauri/.env.example`.

## Documentation

Design specs and implementation plans are in [`docs/superpowers`](docs/superpowers) (in Portuguese).
