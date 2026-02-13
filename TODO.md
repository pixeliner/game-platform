# TODO (Milestones)

## Milestone 0: Tooling & Repo
- [x] Create Turborepo + TypeScript workspace layout
- [x] Add lint/format (eslint + prettier) + tsconfig base
- [x] Add test runner (vitest) per package + CI pipeline (later)

## Milestone 1: Protocol & Contracts
- [x] packages/protocol: zod schemas for lobby + game messages
- [x] Add protocol versioning + codecs
- [x] Add protocol tests (roundtrip)

## Milestone 2: Gateway (Rooms)
- [x] apps/gateway: websocket server
- [x] Lobby lifecycle: create/join/leave
- [x] Chat, voting, ready states
- [x] Room manager: lobby -> game session creation
- [x] Basic auth: guest identity token (LAN)

## Milestone 3: Engine Runtime
- [x] packages/engine: tick loop fixed timestep
- [x] Input queue per player w/ validation
- [x] Snapshot broadcaster strategy (full snapshot per N ticks)
- [x] Engine tests

## Milestone 4: Bomberman (Server Sim)
- [x] packages/games/bomberman: map + entities
- [x] Movement + collision
- [x] Bomb placement + fuse + explosion + deaths
- [x] Game over + results
- [x] Determinism tests

## Milestone 5: Web UI (Lobby)
- [x] Next.js app with shadcn/ui
- [x] Lobby screens: create/join, chat, voting, ready
- [x] Connect to gateway via ws client

## Milestone 6: Web UI (Bomberman Client)
- [x] Canvas renderer (2D)
- [x] Input capture -> send to server
- [x] Render snapshots

## Milestone 7: Persistence (Stats/History)
- [x] SQLite repositories
- [x] Store match results + per-player stats
- [x] Web: history + stats pages

## Later
- [ ] Powerups + destructible blocks variety
- [ ] End screen with scoreboard
- [ ] Reconnect support + late join spectators
- [ ] Achievements and cosmetics
- [ ] Lobby list and password protected lobbies
- [ ] Debug system, host options/commands, monitoring system for admins
