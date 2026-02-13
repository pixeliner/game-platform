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
        hostPlayerId: 'player_1',
        phase: 'waiting',
        activeRoomId: null,
        selectedGameId: 'bomberman',
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
