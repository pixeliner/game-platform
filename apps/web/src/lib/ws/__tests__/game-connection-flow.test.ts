import { describe, expect, it } from 'vitest';

import {
  buildSpectateJoinMessage,
  isTerminalGameLobbyErrorCode,
  normalizeGameRouteMode,
  resolvePlayerLobbyId,
} from '../game-connection-flow';

describe('game-connection-flow', () => {
  it('normalizes route mode and resolves player lobby id with explicit query first', () => {
    expect(normalizeGameRouteMode('spectator')).toBe('spectator');
    expect(normalizeGameRouteMode('player')).toBe('player');
    expect(normalizeGameRouteMode('unexpected')).toBe('player');

    const resolved = resolvePlayerLobbyId({
      requestedLobbyId: 'lobby_query',
      roomId: 'room_1',
      readActiveGameSession: () => ({
        lobbyId: 'lobby_store',
        mode: 'player',
      }),
    });
    expect(resolved).toBe('lobby_query');
  });

  it('falls back to active game session store for player mode and skips spectator records', () => {
    const fromPlayerStore = resolvePlayerLobbyId({
      requestedLobbyId: null,
      roomId: 'room_1',
      readActiveGameSession: () => ({
        lobbyId: 'lobby_store',
        mode: 'player',
      }),
    });
    expect(fromPlayerStore).toBe('lobby_store');

    const fromSpectatorStore = resolvePlayerLobbyId({
      requestedLobbyId: null,
      roomId: 'room_2',
      readActiveGameSession: () => ({
        lobbyId: 'lobby_spec',
        mode: 'spectator',
      }),
    });
    expect(fromSpectatorStore).toBeNull();
  });

  it('builds spectate join message and identifies terminal lobby errors', () => {
    const message = buildSpectateJoinMessage({
      roomId: 'room_1',
      guestId: 'guest_1',
      nickname: 'Watcher',
    });

    expect(message).toEqual({
      v: 1,
      type: 'game.spectate.join',
      payload: {
        roomId: 'room_1',
        guestId: 'guest_1',
        nickname: 'Watcher',
      },
    });

    expect(isTerminalGameLobbyErrorCode('invalid_session_token')).toBe(true);
    expect(isTerminalGameLobbyErrorCode('unauthorized')).toBe(true);
    expect(isTerminalGameLobbyErrorCode('invalid_state')).toBe(true);
    expect(isTerminalGameLobbyErrorCode('not_ready')).toBe(false);
  });
});
