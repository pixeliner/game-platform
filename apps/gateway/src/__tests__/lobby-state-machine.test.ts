import { describe, expect, it } from 'vitest';

import { LobbyServiceError } from '../errors.js';
import { LobbyStateMachine } from '../lobby/lobby-state-machine.js';

function expectLobbyError(fn: () => void, code: string): void {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(LobbyServiceError);
    expect((error as LobbyServiceError).code).toBe(code);
    return;
  }

  throw new Error('Expected LobbyServiceError');
}

describe('LobbyStateMachine', () => {
  it('creates lobby with host player', () => {
    const machine = new LobbyStateMachine();

    const lobby = machine.createLobby({
      lobbyId: 'lobby-1',
      playerId: 'player-1',
      guestId: 'guest-1',
      nickname: 'Host',
      nowMs: 1,
    });

    expect(lobby.hostPlayerId).toBe('player-1');
    expect(lobby.phase).toBe('waiting');
    expect(lobby.playersById.get('player-1')?.isHost).toBe(true);
  });

  it('joins and migrates host on leave', () => {
    const machine = new LobbyStateMachine();

    machine.createLobby({
      lobbyId: 'lobby-1',
      playerId: 'player-1',
      guestId: 'guest-1',
      nickname: 'Host',
      nowMs: 1,
    });

    machine.joinLobby({
      lobbyId: 'lobby-1',
      playerId: 'player-2',
      guestId: 'guest-2',
      nickname: 'B',
      nowMs: 2,
    });

    const updated = machine.removePlayer('lobby-1', 'player-1', 3);
    expect(updated?.hostPlayerId).toBe('player-2');
    expect(updated?.playersById.get('player-2')?.isHost).toBe(true);
  });

  it('applies majority vote and host override', () => {
    const machine = new LobbyStateMachine();

    machine.createLobby({
      lobbyId: 'lobby-1',
      playerId: 'player-1',
      guestId: 'guest-1',
      nickname: 'Host',
      nowMs: 1,
    });
    machine.joinLobby({
      lobbyId: 'lobby-1',
      playerId: 'player-2',
      guestId: 'guest-2',
      nickname: 'B',
      nowMs: 2,
    });
    machine.joinLobby({
      lobbyId: 'lobby-1',
      playerId: 'player-3',
      guestId: 'guest-3',
      nickname: 'C',
      nowMs: 3,
    });

    machine.castVote({
      lobbyId: 'lobby-1',
      playerId: 'player-2',
      gameId: 'ctf',
      nowMs: 4,
    });
    machine.castVote({
      lobbyId: 'lobby-1',
      playerId: 'player-3',
      gameId: 'ctf',
      nowMs: 5,
    });

    const majorityLobby = machine.getLobby('lobby-1');
    expect(majorityLobby?.selectedGameId).toBe('ctf');

    machine.castVote({
      lobbyId: 'lobby-1',
      playerId: 'player-1',
      gameId: 'bomberman',
      nowMs: 6,
    });

    const hostOverrideLobby = machine.getLobby('lobby-1');
    expect(hostOverrideLobby?.selectedGameId).toBe('bomberman');
  });

  it('validates start preconditions', () => {
    const machine = new LobbyStateMachine();

    machine.createLobby({
      lobbyId: 'lobby-1',
      playerId: 'player-1',
      guestId: 'guest-1',
      nickname: 'Host',
      nowMs: 1,
    });

    expectLobbyError(
      () =>
        machine.requestStart({
          lobbyId: 'lobby-1',
          requestedByPlayerId: 'player-1',
          nowMs: 2,
        }),
      'game_not_selected',
    );

    machine.joinLobby({
      lobbyId: 'lobby-1',
      playerId: 'player-2',
      guestId: 'guest-2',
      nickname: 'B',
      nowMs: 3,
    });

    machine.castVote({
      lobbyId: 'lobby-1',
      playerId: 'player-1',
      gameId: 'bomberman',
      nowMs: 4,
    });

    expectLobbyError(
      () =>
        machine.requestStart({
          lobbyId: 'lobby-1',
          requestedByPlayerId: 'player-1',
          nowMs: 5,
        }),
      'not_ready',
    );

    machine.setReady({
      lobbyId: 'lobby-1',
      playerId: 'player-1',
      isReady: true,
      nowMs: 6,
    });
    machine.setReady({
      lobbyId: 'lobby-1',
      playerId: 'player-2',
      isReady: true,
      nowMs: 7,
    });

    const started = machine.requestStart({
      lobbyId: 'lobby-1',
      requestedByPlayerId: 'player-1',
      nowMs: 8,
    });

    expect(started.gameId).toBe('bomberman');
    expect(started.lobby.phase).toBe('starting');
  });
});
