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
- [ ] packages/engine: tick loop fixed timestep
- [ ] Input queue per player w/ validation
- [ ] Snapshot broadcaster strategy (full snapshot per N ticks)
- [ ] Engine tests

## Milestone 4: Bomberman (Server Sim)
- [ ] packages/games/bomberman: map + entities
- [ ] Movement + collision
- [ ] Bomb placement + fuse + explosion + deaths
- [ ] Game over + results
- [ ] Determinism tests

## Milestone 5: Web UI (Lobby)
- [ ] Next.js app with shadcn/ui
- [ ] Lobby screens: create/join, chat, voting, ready
- [ ] Connect to gateway via ws client

## Milestone 6: Web UI (Bomberman Client)
- [ ] Canvas renderer (2D)
- [ ] Input capture -> send to server
- [ ] Render snapshots

## Milestone 7: Persistence (Stats/History)
- [ ] SQLite repositories
- [ ] Store match results + per-player stats
- [ ] Web: history + stats pages

## Later
- [ ] Powerups + destructible blocks variety
- [ ] Reconnect support + late join spectators
- [ ] Achievements and cosmetics
- [ ] LAN discovery (mDNS)
