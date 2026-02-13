# Contracts

## Message Types (High level)
### Lobby
- lobby.create
- lobby.join
- lobby.leave
- lobby.chat.send
- lobby.chat.message (server broadcast)
- lobby.vote.cast
- lobby.state (server broadcast)
- lobby.ready.set
- lobby.start.request
- lobby.start.accepted (server)
- lobby.auth.issued (server direct)
- lobby.error

### Game Session
- game.join
- game.join.accepted (server direct)
- game.leave
- game.input
- game.snapshot
- game.event
- game.over

## Bomberman v1 Payload Semantics
- `game.input.payload.input` for bomberman:
  - `{ kind: "move.intent", direction: "up" | "down" | "left" | "right" | null }`
  - `{ kind: "bomb.place" }`
  - `{ kind: "bomb.remote_detonate" }`
  - `{ kind: "bomb.throw" }`
- `game.event.payload.event` for bomberman:
  - `player.moved`
  - `bomb.placed`
  - `bomb.exploded`
  - `bomb.kicked`
  - `bomb.thrown`
  - `bomb.remote_detonated`
  - `block.destroyed`
  - `powerup.spawned`
  - `powerup.collected`
  - `player.eliminated`
  - `round.over`
  - Drop reveal timing:
    - `block.destroyed.droppedPowerupKind` communicates the deterministic roll result at destruction time.
    - The actual pickup is materialized later via `powerup.spawned`, only after flame has cleared from the tile.
- `game.snapshot.payload.snapshot` for bomberman includes:
  - `tick`, `phase`, `winnerPlayerId`
  - map dimensions + wall tile coordinates
  - soft block entries with variant kind (`brick` | `crate` | `barrel`)
  - spawned powerups (`bomb_up`, `blast_up`, `speed_up`, `remote_detonator`, `kick_bombs`, `throw_bombs`)
  - players with progression fields (`bombLimit`, `blastRadius`, `speedTier`, ability booleans)
  - bombs with movement metadata (`movingDirection`)
  - flames

## Identity
- Client generates guestId (uuid) and nickname
- Gateway issues short-lived session token for ws reconnect
- `lobby.join` may include optional `sessionToken` for reconnect intent
- `lobby.state.players[*]` includes `isConnected` for reconnect visibility

## Rematch Lifecycle
- Match completion keeps lobby identity and vote selection intact.
- After `game.over`, gateway transitions lobby phase from `in_game` back to `waiting`.
- Connected players are reset to `isReady = false` and must ready/start again for a rematch.

## Game Module Interface (packages/engine)
- Each module must be deterministic given:
  - initial config
  - seed
  - ordered input stream per player

## Persistence
- Match record includes:
  - matchId, gameId, startedAt, endedAt, lobbyId
  - players: ids, results (rank/score), metadata
  - optional events summary

## Persistence HTTP API
Gateway exposes read-only analytics endpoints:

- `GET /api/history`
  - query: `limit` (default 20, max 100), `offset` (default 0), `gameId?`, `guestId?`
  - response: `{ items, page }`
- `GET /api/stats/:guestId`
  - query: `gameId?`, `historyLimit` (default 10, max 50), `historyOffset` (default 0)
  - response: `{ guestId, latestNickname, overall, byGame, recentMatches, page }`
- `GET /api/leaderboard`
  - query: `limit` (default 20, max 100), `offset` (default 0), `gameId?`
  - response: `{ items, page }`

Ordering semantics:
- history: `endedAtMs DESC`, then `matchId DESC`
- leaderboard: `wins DESC`, `totalScore DESC`, `averageRank ASC`, `lastPlayedAtMs DESC`, `guestId ASC`
- per-match players: `rank ASC`, `guestId ASC`
