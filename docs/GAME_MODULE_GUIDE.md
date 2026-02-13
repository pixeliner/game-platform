# How to add a game module

## Folder
packages/games/<gameId>

## Must implement
- createGame(config, seed): GameInstance
- GameInstance methods:
  - applyInput(playerId, input, tick)
  - tick()
  - getSnapshot()
  - getEventsSince(lastEventId)
  - isGameOver()
  - getResults()

## Provide
- protocol input schema + snapshot schema
- config schema
- renderer adapter (web) mapping snapshot -> draw
- tests:
  - determinism: same seed + same inputs => same end state
  - invariant checks
