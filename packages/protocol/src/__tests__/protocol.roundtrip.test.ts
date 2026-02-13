import { describe, expect, it } from 'vitest';

import {
  PROTOCOL_VERSION,
  ProtocolDecodeError,
  decodeMessage,
  encodeMessage,
  safeDecodeMessage,
  type ProtocolMessage,
} from '../index.js';

const validMessages: ProtocolMessage[] = [
  {
    v: PROTOCOL_VERSION,
    type: 'lobby.create',
    payload: {
      guestId: 'guest-1',
      nickname: 'Alice',
      lobbyName: 'LAN Night',
    },
  },
  {
    v: PROTOCOL_VERSION,
    type: 'lobby.join',
    payload: {
      lobbyId: 'lobby-1',
      guestId: 'guest-2',
      nickname: 'Bob',
      sessionToken: 'token-1',
    },
  },
  {
    v: PROTOCOL_VERSION,
    type: 'lobby.leave',
    payload: {
      lobbyId: 'lobby-1',
      guestId: 'guest-2',
      reason: 'disconnect',
    },
  },
  {
    v: PROTOCOL_VERSION,
    type: 'lobby.chat.send',
    payload: {
      lobbyId: 'lobby-1',
      playerId: 'player-1',
      text: 'hello',
    },
  },
  {
    v: PROTOCOL_VERSION,
    type: 'lobby.chat.message',
    payload: {
      lobbyId: 'lobby-1',
      messageId: 'msg-1',
      playerId: 'player-1',
      nickname: 'Alice',
      text: 'hello',
      sentAtMs: 1,
    },
  },
  {
    v: PROTOCOL_VERSION,
    type: 'lobby.vote.cast',
    payload: {
      lobbyId: 'lobby-1',
      playerId: 'player-1',
      gameId: 'bomberman',
    },
  },
  {
    v: PROTOCOL_VERSION,
    type: 'lobby.state',
    payload: {
      lobbyId: 'lobby-1',
      hostPlayerId: 'player-1',
      phase: 'waiting',
      selectedGameId: 'bomberman',
      players: [
        {
          playerId: 'player-1',
          guestId: 'guest-1',
          nickname: 'Alice',
          isHost: true,
          isReady: true,
          voteGameId: 'bomberman',
          isConnected: true,
        },
      ],
      votesByPlayerId: {
        'player-1': 'bomberman',
      },
    },
  },
  {
    v: PROTOCOL_VERSION,
    type: 'lobby.ready.set',
    payload: {
      lobbyId: 'lobby-1',
      playerId: 'player-1',
      isReady: true,
    },
  },
  {
    v: PROTOCOL_VERSION,
    type: 'lobby.start.request',
    payload: {
      lobbyId: 'lobby-1',
      requestedByPlayerId: 'player-1',
    },
  },
  {
    v: PROTOCOL_VERSION,
    type: 'lobby.start.accepted',
    payload: {
      lobbyId: 'lobby-1',
      roomId: 'room-1',
      gameId: 'bomberman',
      seed: 42,
      tickRate: 20,
      startedAtMs: 1700000000000,
    },
  },
  {
    v: PROTOCOL_VERSION,
    type: 'lobby.auth.issued',
    payload: {
      lobbyId: 'lobby-1',
      playerId: 'player-1',
      guestId: 'guest-1',
      sessionToken: 'token-abc',
      expiresAtMs: 1700000009999,
    },
  },
  {
    v: PROTOCOL_VERSION,
    type: 'lobby.error',
    payload: {
      lobbyId: 'lobby-1',
      code: 'not_ready',
      message: 'Not all players are ready',
      details: {
        missing: ['player-2'],
      },
    },
  },
  {
    v: PROTOCOL_VERSION,
    type: 'game.join',
    payload: {
      roomId: 'room-1',
      playerId: 'player-1',
    },
  },
  {
    v: PROTOCOL_VERSION,
    type: 'game.leave',
    payload: {
      roomId: 'room-1',
      playerId: 'player-2',
      reason: 'quit',
    },
  },
  {
    v: PROTOCOL_VERSION,
    type: 'game.input',
    payload: {
      roomId: 'room-1',
      playerId: 'player-1',
      tick: 12,
      input: {
        kind: 'move',
        direction: 'left',
      },
    },
  },
  {
    v: PROTOCOL_VERSION,
    type: 'game.snapshot',
    payload: {
      roomId: 'room-1',
      gameId: 'bomberman',
      tick: 12,
      snapshot: {
        players: [],
      },
    },
  },
  {
    v: PROTOCOL_VERSION,
    type: 'game.event',
    payload: {
      roomId: 'room-1',
      gameId: 'bomberman',
      eventId: 3,
      tick: 12,
      event: {
        kind: 'bomb.exploded',
      },
    },
  },
  {
    v: PROTOCOL_VERSION,
    type: 'game.over',
    payload: {
      roomId: 'room-1',
      gameId: 'bomberman',
      endedAtMs: 1700000000000,
      results: [
        {
          playerId: 'player-1',
          rank: 1,
          score: 5,
        },
      ],
    },
  },
];

describe('protocol message codec', () => {
  for (const message of validMessages) {
    it(`roundtrips ${message.type}`, () => {
      const encoded = encodeMessage(message);
      const decoded = decodeMessage(encoded);

      expect(decoded).toEqual(message);
    });
  }

  it('safeDecodeMessage returns ok result for valid messages', () => {
    const firstMessage = validMessages.at(0);
    expect(firstMessage).toBeDefined();
    if (!firstMessage) {
      return;
    }

    const raw = encodeMessage(firstMessage);
    const result = safeDecodeMessage(raw);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(firstMessage);
    }
  });

  it('rejects invalid protocol version', () => {
    const raw = JSON.stringify({
      v: 2,
      type: 'lobby.create',
      payload: {
        guestId: 'guest-1',
        nickname: 'Alice',
      },
    });

    expect(() => decodeMessage(raw)).toThrow(ProtocolDecodeError);

    const result = safeDecodeMessage(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('invalid_message');
    }
  });

  it('rejects unknown message type', () => {
    const raw = JSON.stringify({
      v: PROTOCOL_VERSION,
      type: 'lobby.ping',
      payload: {},
    });

    expect(() => decodeMessage(raw)).toThrow(ProtocolDecodeError);

    const result = safeDecodeMessage(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('invalid_message');
    }
  });

  it('rejects malformed payload for known type', () => {
    const raw = JSON.stringify({
      v: PROTOCOL_VERSION,
      type: 'lobby.join',
      payload: {
        lobbyId: 'lobby-1',
        nickname: 'Bob',
      },
    });

    expect(() => decodeMessage(raw)).toThrow(ProtocolDecodeError);

    const result = safeDecodeMessage(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('invalid_message');
    }
  });

  it('rejects malformed payload for lobby.auth.issued', () => {
    const raw = JSON.stringify({
      v: PROTOCOL_VERSION,
      type: 'lobby.auth.issued',
      payload: {
        lobbyId: 'lobby-1',
        playerId: 'player-1',
        guestId: 'guest-1',
        expiresAtMs: 1700000000000,
      },
    });

    expect(() => decodeMessage(raw)).toThrow(ProtocolDecodeError);

    const result = safeDecodeMessage(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('invalid_message');
    }
  });

  it('rejects invalid JSON payload', () => {
    const raw = '{"v":1,"type":"lobby.create",';

    expect(() => decodeMessage(raw)).toThrow(ProtocolDecodeError);

    const result = safeDecodeMessage(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('invalid_json');
    }
  });
});
