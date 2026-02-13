# TODO (Milestones)

## Milestone 0: Tooling & Repo
- [x] Create Turborepo + TypeScript workspace layout
- [x] Add lint/format (eslint + prettier) + tsconfig base
- [x] Add test runner (vitest) per package

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

## Milestone 8: Bomberman Gameplay Expansion
- [x] Add powerups (extra bombs, blast radius, speed)
- [x] Add advanced powerups (remote detonation, kick bombs, throw bombs)
- [x] Add destructible block variety and deterministic drop rules
- [x] Add balancing config + determinism/invariant tests

## Milestone 9: Match UX & End Screen
- [x] Add end-of-round screen with scoreboard
- [ ] Show ranking, score, and elimination timeline
- [x] Add post-match actions (back to lobby / rematch-ready flow)

## Milestone 10: Reconnect + Spectators
- [ ] Improve reconnect flow for active games (stateful rejoin UX)
- [ ] Add late-join spectator mode for in-progress matches
- [ ] Add gateway/web integration tests for reconnect and spectator flows

## Milestone 11: Achievements & Cosmetics
- [ ] Add achievement model + unlock triggers
- [ ] Add cosmetics model + player selection UI
- [ ] Persist and display achievements/cosmetics in profile/stats views

## Milestone 12: Lobby Discovery & Access Control
- [ ] Add lobby list endpoint + web lobby browser page
- [ ] Add password-protected lobby creation/join flow
- [ ] Add filters/sorting for discoverability and quick join

## Milestone 13: Debug/Admin Tooling
- [ ] Add debug command system for host/admin actions
- [ ] Add host options and runtime controls (tick rate, start/stop, kick, etc.)
- [ ] Add monitoring/diagnostics surface for admins

## Milestone 14: CI Pipeline
- [ ] Add CI pipeline for lint, typecheck, and tests across workspace
- [ ] Cache pnpm/turbo artifacts for faster feedback
- [ ] Add branch protection checks for gateway + web + games packages
