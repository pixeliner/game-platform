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
      lobbyName: 'LAN Session',
      maxPlayers: 4,
      passwordHash: null,
      nowMs: 1,
    });

    expect(lobby.hostPlayerId).toBe('player-1');
    expect(lobby.phase).toBe('waiting');
    expect(lobby.activeRoomId).toBeNull();
    expect(lobby.playersById.get('player-1')?.isHost).toBe(true);
  });

  it('joins and migrates host on leave', () => {
    const machine = new LobbyStateMachine();

    machine.createLobby({
      lobbyId: 'lobby-1',
      playerId: 'player-1',
      guestId: 'guest-1',
      nickname: 'Host',
      lobbyName: 'LAN Session',
      maxPlayers: 4,
      passwordHash: null,
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

  it('rejects joins when lobby reaches max player capacity', () => {
    const machine = new LobbyStateMachine();

    machine.createLobby({
      lobbyId: 'lobby-1',
      playerId: 'player-1',
      guestId: 'guest-1',
      nickname: 'Host',
      lobbyName: 'LAN Session',
      maxPlayers: 2,
      passwordHash: null,
      nowMs: 1,
    });

    machine.joinLobby({
      lobbyId: 'lobby-1',
      playerId: 'player-2',
      guestId: 'guest-2',
      nickname: 'Guest',
      nowMs: 2,
    });

    expectLobbyError(
      () =>
        machine.joinLobby({
          lobbyId: 'lobby-1',
          playerId: 'player-3',
          guestId: 'guest-3',
          nickname: 'Guest 2',
          nowMs: 3,
        }),
      'lobby_full',
    );
  });

  it('applies majority vote and host override', () => {
    const machine = new LobbyStateMachine();

    machine.createLobby({
      lobbyId: 'lobby-1',
      playerId: 'player-1',
      guestId: 'guest-1',
      nickname: 'Host',
      lobbyName: 'LAN Session',
      maxPlayers: 4,
      passwordHash: null,
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
      lobbyName: 'LAN Session',
      maxPlayers: 4,
      passwordHash: null,
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

  it('returns lobby to waiting and resets readiness after game completion', () => {
    const machine = new LobbyStateMachine();

    machine.createLobby({
      lobbyId: 'lobby-1',
      playerId: 'player-1',
      guestId: 'guest-1',
      nickname: 'Host',
      lobbyName: 'LAN Session',
      maxPlayers: 4,
      passwordHash: null,
      nowMs: 1,
    });
    machine.joinLobby({
      lobbyId: 'lobby-1',
      playerId: 'player-2',
      guestId: 'guest-2',
      nickname: 'Guest',
      nowMs: 2,
    });

    machine.castVote({
      lobbyId: 'lobby-1',
      playerId: 'player-1',
      gameId: 'bomberman',
      nowMs: 3,
    });
    machine.setReady({
      lobbyId: 'lobby-1',
      playerId: 'player-1',
      isReady: true,
      nowMs: 4,
    });
    machine.setReady({
      lobbyId: 'lobby-1',
      playerId: 'player-2',
      isReady: true,
      nowMs: 5,
    });

    machine.requestStart({
      lobbyId: 'lobby-1',
      requestedByPlayerId: 'player-1',
      nowMs: 6,
    });
    machine.setInGame('lobby-1', 'room-1', 7);

    const resetLobby = machine.setWaitingAfterGame('lobby-1', 8);

    expect(resetLobby.phase).toBe('waiting');
    expect(resetLobby.activeRoomId).toBeNull();
    expect(resetLobby.selectedGameId).toBe('bomberman');
    expect(resetLobby.playersById.get('player-1')?.isReady).toBe(false);
    expect(resetLobby.playersById.get('player-2')?.isReady).toBe(false);
  });
});
