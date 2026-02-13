import { describe, expect, it } from 'vitest';

import {
  historyQuerySchema,
  matchByRoomPathParamsSchema,
  matchByRoomResponseSchema,
  leaderboardResponseSchema,
  matchHistoryResponseSchema,
  playerStatsResponseSchema,
} from '../persistence.js';

describe('persistence contracts', () => {
  it('parses valid history query defaults', () => {
    const parsed = historyQuerySchema.parse({});

    expect(parsed.limit).toBe(20);
    expect(parsed.offset).toBe(0);
  });

  it('rejects invalid history query values', () => {
    const result = historyQuerySchema.safeParse({
      limit: 0,
      offset: -1,
    });

    expect(result.success).toBe(false);
  });

  it('parses valid match history response', () => {
    const result = matchHistoryResponseSchema.safeParse({
      items: [
        {
          matchId: 'match-1',
          roomId: 'room-1',
          lobbyId: 'lobby-1',
          gameId: 'bomberman',
          seed: 10,
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
          ],
        },
      ],
      page: {
        limit: 20,
        offset: 0,
        total: 1,
      },
    });

    expect(result.success).toBe(true);
  });

  it('parses valid match-by-room path and response payload', () => {
    const path = matchByRoomPathParamsSchema.safeParse({
      roomId: 'room-1',
    });
    expect(path.success).toBe(true);

    const response = matchByRoomResponseSchema.safeParse({
      item: {
        matchId: 'match-1',
        roomId: 'room-1',
        lobbyId: 'lobby-1',
        gameId: 'bomberman',
        seed: 10,
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
        ],
      },
    });

    expect(response.success).toBe(true);
  });

  it('rejects invalid leaderboard response values', () => {
    const result = leaderboardResponseSchema.safeParse({
      items: [
        {
          guestId: 'guest-1',
          latestNickname: 'Alpha',
          matchesPlayed: 10,
          wins: 2,
          winRate: 2,
          totalScore: 10,
          averageRank: 1.2,
          bestRank: 1,
          lastPlayedAtMs: 1000,
        },
      ],
      page: {
        limit: 20,
        offset: 0,
        total: 1,
      },
    });

    expect(result.success).toBe(false);
  });

  it('rejects malformed match-by-room values', () => {
    const invalidPath = matchByRoomPathParamsSchema.safeParse({
      roomId: '',
    });
    expect(invalidPath.success).toBe(false);

    const invalidResponse = matchByRoomResponseSchema.safeParse({
      item: {
        matchId: 'match-1',
        roomId: 'room-1',
        lobbyId: 'lobby-1',
        gameId: 'bomberman',
        seed: 10,
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
            rank: 0,
            score: 5,
            alive: true,
            eliminatedAtTick: null,
          },
        ],
      },
    });
    expect(invalidResponse.success).toBe(false);
  });

  it('rejects invalid stats response rank shape', () => {
    const result = playerStatsResponseSchema.safeParse({
      guestId: 'guest-1',
      latestNickname: 'Alpha',
      overall: {
        matchesPlayed: 1,
        wins: 1,
        winRate: 1,
        totalScore: 4,
        averageRank: 1,
        bestRank: 0,
        lastPlayedAtMs: 1000,
      },
      byGame: [],
      recentMatches: [],
      page: {
        limit: 10,
        offset: 0,
        total: 0,
      },
    });

    expect(result.success).toBe(false);
  });
});
