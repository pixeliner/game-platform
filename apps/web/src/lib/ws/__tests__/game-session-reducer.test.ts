import { describe, expect, it } from 'vitest';

import {
  createInitialGameSessionState,
  gameSessionReducer,
} from '../game-session-reducer';

describe('game-session-reducer', () => {
  it('stores auth and join acceptance state', () => {
    const initial = createInitialGameSessionState('room-1', 'lobby-1');

    const withAuth = gameSessionReducer(initial, {
      type: 'lobby.auth.issued',
      payload: {
        lobbyId: 'lobby-1',
        playerId: 'player-1',
        guestId: 'guest-1',
        sessionToken: 'token-1',
        expiresAtMs: 5_000,
      },
    });

    const withJoin = gameSessionReducer(withAuth, {
      type: 'game.join.accepted',
      payload: {
        roomId: 'room-1',
        gameId: 'bomberman',
        playerId: 'player-1',
        tick: 8,
        joinedAtMs: 2_000,
      },
    });

    expect(withJoin.auth?.playerId).toBe('player-1');
    expect(withJoin.joinAccepted?.tick).toBe(8);
    expect(withJoin.sessionRole).toBe('player');
    expect(withJoin.connectionStatus).toBe('connected');
  });

  it('stores spectator join state and role', () => {
    const initial = createInitialGameSessionState('room-1', 'lobby-1');
    const withSpectateJoin = gameSessionReducer(initial, {
      type: 'game.spectate.joined',
      payload: {
        roomId: 'room-1',
        gameId: 'bomberman',
        spectatorId: 'spectator-1',
        tick: 3,
        joinedAtMs: 4_000,
      },
    });

    expect(withSpectateJoin.sessionRole).toBe('spectator');
    expect(withSpectateJoin.spectateJoined?.spectatorId).toBe('spectator-1');
    expect(withSpectateJoin.connectionStatus).toBe('connected');
  });

  it('ignores stale snapshots and accepts newer ticks', () => {
    const initial = createInitialGameSessionState('room-1', 'lobby-1');

    const withNewSnapshot = gameSessionReducer(initial, {
      type: 'game.snapshot',
      payload: {
        tick: 12,
        snapshot: {
          tick: 12,
          phase: 'running',
          width: 2,
          height: 2,
          hardWalls: [],
          softBlocks: [],
          powerups: [],
          players: [],
          bombs: [],
          flames: [],
          winnerPlayerId: null,
        },
      },
    });

    const withStaleSnapshot = gameSessionReducer(withNewSnapshot, {
      type: 'game.snapshot',
      payload: {
        tick: 9,
        snapshot: {
          tick: 9,
          phase: 'running',
          width: 2,
          height: 2,
          hardWalls: [],
          softBlocks: [],
          powerups: [],
          players: [],
          bombs: [],
          flames: [],
          winnerPlayerId: null,
        },
      },
    });

    expect(withStaleSnapshot.latestSnapshotTick).toBe(12);
    expect(withStaleSnapshot.latestSnapshot?.tick).toBe(12);
  });

  it('stores sorted events and transitions to game_over', () => {
    const initial = createInitialGameSessionState('room-1', 'lobby-1');

    const withSecondEvent = gameSessionReducer(initial, {
      type: 'game.event',
      payload: {
        eventId: 2,
        tick: 10,
        event: {
          kind: 'block.destroyed',
          x: 2,
          y: 3,
          blockKind: 'brick',
          droppedPowerupKind: null,
        },
      },
    });

    const withFirstEvent = gameSessionReducer(withSecondEvent, {
      type: 'game.event',
      payload: {
        eventId: 1,
        tick: 9,
        event: {
          kind: 'bomb.placed',
          playerId: 'player-1',
          x: 1,
          y: 1,
          fuseTicksRemaining: 20,
          radius: 2,
        },
      },
    });

    const withGameOver = gameSessionReducer(withFirstEvent, {
      type: 'game.over',
      payload: {
        roomId: 'room-1',
        gameId: 'bomberman',
        endedAtMs: 4_000,
        results: [{ playerId: 'player-1', rank: 1, score: 1 }],
      },
    });

    expect(withGameOver.recentEvents.map((event) => event.eventId)).toEqual([1, 2]);
    expect(withGameOver.connectionStatus).toBe('game_over');
    expect(withGameOver.gameOver?.results[0]?.playerId).toBe('player-1');
  });
});
