# TODO (Milestones)

## Milestone 0: Tooling & Repo
- [ ] Create Turborepo + TypeScript workspace layout
- [ ] Add lint/format (eslint + prettier) + tsconfig base
- [ ] Add test runner (vitest) per package + CI pipeline (later)

## Milestone 1: Protocol & Contracts
- [ ] packages/protocol: zod schemas for lobby + game messages
- [ ] Add protocol versioning + codecs
- [ ] Add protocol tests (roundtrip)

## Milestone 2: Gateway (Rooms)
- [ ] apps/gateway: websocket server
- [ ] Lobby lifecycle: create/join/leave
- [ ] Chat, voting, ready states
- [ ] Room manager: lobby -> game session creation
- [ ] Basic auth: guest identity token (LAN)

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
