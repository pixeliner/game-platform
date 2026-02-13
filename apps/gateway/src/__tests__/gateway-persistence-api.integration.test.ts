import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  leaderboardResponseSchema,
  matchByRoomResponseSchema,
  matchHistoryResponseSchema,
  playerStatsResponseSchema,
} from '@game-platform/protocol';
import { SqliteMatchRepository } from '@game-platform/storage';

import type { GatewayConfig } from '../config.js';
import { createGatewayServer, type GatewayServer } from '../index.js';

describe('gateway persistence HTTP API', () => {
  let server: GatewayServer;
  let baseUrl: string;

  beforeEach(async () => {
    const repository = new SqliteMatchRepository({
      dbPath: ':memory:',
    });
    repository.recordMatch({
      matchId: 'match-1',
      roomId: 'room-1',
      lobbyId: 'lobby-1',
      gameId: 'bomberman',
      seed: 42,
      tickRate: 20,
      startedAtMs: 1000,
      endedAtMs: 2000,
      endReason: 'game_over',
      winnerPlayerId: 'player-1',
      winnerGuestId: 'guest-1',
      players: [
        {
          playerId: 'player-1',
          guestId: 'guest-1',
          nickname: 'Alpha',
          rank: 1,
          score: 5,
          alive: true,
          eliminatedAtTick: null,
        },
        {
          playerId: 'player-2',
          guestId: 'guest-2',
          nickname: 'Bravo',
          rank: 2,
          score: 1,
          alive: false,
          eliminatedAtTick: 30,
        },
      ],
    });

    const config: GatewayConfig = {
      host: '127.0.0.1',
      port: 0,
      sessionTtlMs: 5_000,
      reconnectGraceMs: 1_000,
      tickRate: 20,
      snapshotEveryTicks: 2,
      lobbyMaxPlayers: 4,
      bombermanMovementModel: 'grid_smooth',
      roomIdleTimeoutMs: 100,
      sessionSecret: 'test-secret',
      sqlitePath: ':memory:',
    };

    server = createGatewayServer({
      config,
      clock: {
        nowMs: () => 10_000,
      },
      matchRepository: repository,
    });

    await server.start();
    baseUrl = `http://127.0.0.1:${server.getPort()}`;
  });

  afterEach(async () => {
    await server.stop();
  });

  it('returns history payload', async () => {
    const response = await fetch(`${baseUrl}/api/history?limit=20&offset=0`);
    expect(response.status).toBe(200);

    const body = await response.json();
    const parsed = matchHistoryResponseSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      return;
    }

    expect(parsed.data.page.total).toBe(1);
    expect(parsed.data.items[0]?.matchId).toBe('match-1');
  });

  it('returns player stats payload', async () => {
    const response = await fetch(`${baseUrl}/api/stats/guest-1?historyLimit=10&historyOffset=0`);
    expect(response.status).toBe(200);

    const body = await response.json();
    const parsed = playerStatsResponseSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      return;
    }

    expect(parsed.data.guestId).toBe('guest-1');
    expect(parsed.data.overall.matchesPlayed).toBe(1);
    expect(parsed.data.overall.wins).toBe(1);
  });

  it('returns leaderboard payload and rejects invalid query', async () => {
    const validResponse = await fetch(`${baseUrl}/api/leaderboard?limit=20&offset=0`);
    expect(validResponse.status).toBe(200);

    const validBody = await validResponse.json();
    const parsed = leaderboardResponseSchema.safeParse(validBody);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.items[0]?.guestId).toBe('guest-1');
    }

    const invalidResponse = await fetch(`${baseUrl}/api/leaderboard?limit=0&offset=0`);
    expect(invalidResponse.status).toBe(400);
  });

  it('returns a match by room id and 404 for unknown room', async () => {
    const foundResponse = await fetch(`${baseUrl}/api/matches/room-1`);
    expect(foundResponse.status).toBe(200);

    const foundBody = await foundResponse.json();
    const foundParsed = matchByRoomResponseSchema.safeParse(foundBody);
    expect(foundParsed.success).toBe(true);
    if (foundParsed.success) {
      expect(foundParsed.data.item.matchId).toBe('match-1');
      expect(foundParsed.data.item.roomId).toBe('room-1');
    }

    const missingResponse = await fetch(`${baseUrl}/api/matches/room-missing`);
    expect(missingResponse.status).toBe(404);
    const missingBody = await missingResponse.json();
    expect(missingBody.error?.code).toBe('not_found');
  });
});
