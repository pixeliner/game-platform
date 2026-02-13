# Game Platform (LAN) - Architecture & Plan

## Goals
- LAN-first game platform: lobby -> vote/select game -> chat -> ready -> play -> results
- First milestone game: Bomberman (simple, deterministic, authoritative server)
- Easy to add games: "game modules" with strict contracts, shared types, and test scaffolding
- Maintainable, well-tested, strongly typed TypeScript monorepo

## Non-Goals (initially)
- Complex matchmaking
- Anti-cheat for public internet
- Payment/monetization
- Heavy 3D rendering

## Core Requirements
### Functional
- Users can create/join lobby (LAN)
- Lobby has:
  - chat
  - game selection (vote + host override optional)
  - ready/unready
  - start game when conditions met
- Game session:
  - authoritative server simulation
  - clients send inputs
  - server broadcasts snapshots/events
  - end game -> stats + match history persisted
- Player profile:
  - nickname (LAN)
  - stats per game
  - match history
  - achievements (stub for now)
  - cosmetics (stub for now)

### Quality
- Deterministic simulation for Bomberman
- Separation: UI / networking / simulation / persistence
- Robust tests: unit tests for simulation + protocol contracts + e2e smoke (optional later)

## Architectural Overview
Monorepo (Turborepo) with shared packages.

### Packages
- apps/web:
  - Next.js (App Router) UI (shadcn/ui)
  - Connects to gateway via WebSocket
  - Renders lobby + game canvas
- apps/gateway:
  - Node server (Fastify or Hono) + WebSocket
  - Lobby service + room orchestration + session lifecycle
- packages/protocol:
  - Shared message schemas (zod), versioning, codecs
- packages/engine:
  - Generic game runtime (tick loop, input queue, snapshot/events)
  - GameModule interface, validations, clock/scheduler
- packages/games/bomberman:
  - Bomberman simulation module (pure + deterministic)
  - Map generator, collision, bombs, flames, pickups (later)
- packages/storage:
  - Persistence abstractions
  - Default: SQLite (LAN friendly) via a thin repository layer
- packages/ui:
  - shared UI components (optional)
- packages/config, packages/ts, etc.

### Key Concepts
- Authoritative server:
  - Clients send INPUT only (move direction, place bomb)
  - Server simulates and broadcasts snapshots/events
- Deterministic engine:
  - Fixed tick rate (e.g. 20 tps)
  - Inputs stamped with client tick (or server time), server reconciles
- Protocol:
  - Strict type-safe messages:
    - Lobby: CreateLobby, JoinLobby, ChatSend, VoteGame, Ready, StartGame
    - Game: Input, Snapshot, Event, GameOver
- Game Modules:
  - Each game implements:
    - init(config, seed)
    - applyInput(playerId, input, tick)
    - tick()
    - getSnapshot()
    - isGameOver() + getResults()
  - Engine handles:
    - tick loop
    - input validation (module + protocol)
    - snapshot delta strategy (later)

## Bomberman Milestone Scope (v1)
- Grid map with walls/blocks
- Players move around with simple collision
- Place bomb, fuse timer, explosion cross, kills players
- Be sure to check how collision works when placing bomb
- Win condition: last alive
- No powerups in v1 (can stub)

## Testing Strategy
- packages/engine: unit tests for scheduling, input buffering, deterministic ticks
- packages/games/bomberman: deterministic simulation tests (seeded)
- packages/protocol: schema roundtrip tests (encode/decode)
- apps/gateway: room lifecycle tests with mocked ws clients (later)

## Observability
- Structured logs (pino)
- Room/session IDs, match IDs
- Minimal metrics later

## Implementation Phases
1) Repo scaffolding + protocol contracts
2) Gateway: lobby + ws + room manager
3) Engine runtime + module interface
4) Bomberman sim module + tests
5) Web UI: lobby + chat + ready + game select
6) Web UI: bomberman renderer + input
7) Persistence: match history + stats
8) Achievements/cosmetics stubs
9) Hardening: reconnect, host migration (optional)
10) Polish: packaging + LAN discovery (optional)
