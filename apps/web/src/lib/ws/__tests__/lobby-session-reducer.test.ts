import { describe, expect, it } from 'vitest';

import {
  initialLobbySessionState,
  lobbySessionReducer,
} from '../lobby-session-reducer';

describe('lobby-session-reducer', () => {
  it('stores auth issuance payload', () => {
    const next = lobbySessionReducer(initialLobbySessionState, {
      type: 'lobby.auth.issued',
      payload: {
        lobbyId: 'lobby_1',
        playerId: 'player_1',
        guestId: 'guest_1',
        sessionToken: 'token',
        expiresAtMs: 10,
      },
    });

    expect(next.auth).toMatchObject({
      lobbyId: 'lobby_1',
      playerId: 'player_1',
      guestId: 'guest_1',
      sessionToken: 'token',
      expiresAtMs: 10,
    });
  });

  it('replaces lobby state and appends ordered chat', () => {
    const withState = lobbySessionReducer(initialLobbySessionState, {
      type: 'lobby.state',
      payload: {
        lobbyId: 'lobby_1',
        lobbyName: 'LAN Session',
        hostPlayerId: 'player_1',
        phase: 'waiting',
        activeRoomId: null,
        activeRoomRuntimeState: null,
        selectedGameId: 'bomberman',
        configuredTickRate: 20,
        requiresPassword: false,
        maxPlayers: 4,
        players: [],
        votesByPlayerId: {},
      },
    });

    const withFirstMessage = lobbySessionReducer(withState, {
      type: 'lobby.chat.message',
      payload: {
        lobbyId: 'lobby_1',
        messageId: 'msg_b',
        playerId: 'player_1',
        nickname: 'Host',
        text: 'second',
        sentAtMs: 2,
      },
    });

    const withSecondMessage = lobbySessionReducer(withFirstMessage, {
      type: 'lobby.chat.message',
      payload: {
        lobbyId: 'lobby_1',
        messageId: 'msg_a',
        playerId: 'player_1',
        nickname: 'Host',
        text: 'first',
        sentAtMs: 1,
      },
    });

    expect(withSecondMessage.lobbyState?.lobbyId).toBe('lobby_1');
    expect(withSecondMessage.chatMessages.map((message) => message.messageId)).toEqual(['msg_a', 'msg_b']);
  });

  it('stores admin monitor snapshots and bounded action results', () => {
    const withMonitor = lobbySessionReducer(initialLobbySessionState, {
      type: 'lobby.admin.monitor.state',
      payload: {
        lobbyId: 'lobby_1',
        generatedAtMs: 5,
        hostPlayerId: 'player_1',
        phase: 'in_game',
        activeRoomId: 'room_1',
        activeRoomRuntimeState: 'running',
        configuredTickRate: 20,
        connectedPlayerCount: 2,
        totalPlayerCount: 2,
        room: {
          roomId: 'room_1',
          gameId: 'bomberman',
          tickRate: 20,
          tick: 10,
          runtimeState: 'running',
          participantCount: 2,
          connectedParticipantCount: 2,
          spectatorCount: 0,
          startedAtMs: 1,
        },
      },
    });

    expect(withMonitor.adminMonitor?.room?.tick).toBe(10);

    let next = withMonitor;
    for (let index = 0; index < 30; index += 1) {
      next = lobbySessionReducer(next, {
        type: 'lobby.admin.action.result',
        payload: {
          lobbyId: 'lobby_1',
          action: 'monitor.request',
          status: 'accepted',
          requestedByPlayerId: 'player_1',
          atMs: index,
          message: `m-${index}`,
        },
      });
    }

    expect(next.adminActionResults).toHaveLength(25);
    expect(next.adminActionResults[0]?.message).toBe('m-5');
    expect(next.adminActionResults[24]?.message).toBe('m-29');
  });

  it('captures errors and start accepted payloads', () => {
    const withError = lobbySessionReducer(initialLobbySessionState, {
      type: 'lobby.error',
      payload: {
        code: 'unauthorized',
        message: 'Nope',
      },
    });

    const withStart = lobbySessionReducer(withError, {
      type: 'lobby.start.accepted',
      payload: {
        lobbyId: 'lobby_1',
        roomId: 'room_1',
        gameId: 'bomberman',
        seed: 1,
        tickRate: 20,
        startedAtMs: 1,
      },
    });

    expect(withStart.lastError?.code).toBe('unauthorized');
    expect(withStart.startAccepted?.roomId).toBe('room_1');
  });
});
