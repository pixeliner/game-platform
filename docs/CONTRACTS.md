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
- lobby.error

### Game Session
- game.join
- game.leave
- game.input
- game.snapshot
- game.event
- game.over

## Identity
- Client generates guestId (uuid) and nickname
- Gateway issues short-lived session token for ws reconnect (later)

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
