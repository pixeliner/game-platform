import { describe, expect, it } from 'vitest';

import {
  lobbyDiscoveryQuerySchema,
  lobbyDiscoveryResponseSchema,
  lobbyQuickJoinQuerySchema,
  lobbyQuickJoinResponseSchema,
} from '../lobby-discovery.js';

describe('lobby discovery contracts', () => {
  it('parses valid discovery query defaults', () => {
    const parsed = lobbyDiscoveryQuerySchema.parse({});

    expect(parsed.limit).toBe(20);
    expect(parsed.offset).toBe(0);
    expect(parsed.access).toBe('all');
    expect(parsed.sort).toBe('updated_desc');
  });

  it('parses valid discovery response payload', () => {
    const parsed = lobbyDiscoveryResponseSchema.safeParse({
      items: [
        {
          lobbyId: 'lobby-1',
          lobbyName: 'LAN Session',
          phase: 'waiting',
          activeRoomId: null,
          selectedGameId: 'bomberman',
          requiresPassword: true,
          maxPlayers: 4,
          playerCount: 2,
          connectedCount: 2,
          isJoinable: true,
          createdAtMs: 1000,
          updatedAtMs: 2000,
        },
      ],
      page: {
        limit: 20,
        offset: 0,
        total: 1,
      },
    });

    expect(parsed.success).toBe(true);
  });

  it('parses quick join query and nullable response', () => {
    const query = lobbyQuickJoinQuerySchema.safeParse({
      gameId: 'bomberman',
    });
    expect(query.success).toBe(true);

    const response = lobbyQuickJoinResponseSchema.safeParse({
      item: null,
    });
    expect(response.success).toBe(true);
  });

  it('rejects invalid discovery query values', () => {
    const parsed = lobbyDiscoveryQuerySchema.safeParse({
      limit: 0,
      offset: -1,
      access: 'private',
      sort: 'random',
    });

    expect(parsed.success).toBe(false);
  });

  it('rejects malformed discovery response item values', () => {
    const parsed = lobbyDiscoveryResponseSchema.safeParse({
      items: [
        {
          lobbyId: 'lobby-1',
          lobbyName: 'LAN Session',
          phase: 'waiting',
          activeRoomId: null,
          selectedGameId: 'bomberman',
          requiresPassword: true,
          maxPlayers: 0,
          playerCount: 2,
          connectedCount: 3,
          isJoinable: true,
          createdAtMs: 1000,
          updatedAtMs: 2000,
        },
      ],
      page: {
        limit: 20,
        offset: 0,
        total: 1,
      },
    });

    expect(parsed.success).toBe(false);
  });
});
