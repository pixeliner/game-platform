import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fetchMatchByRoom,
  PersistenceHttpError,
  fetchLeaderboard,
  fetchMatchHistory,
  fetchPlayerStats,
} from '../persistence-client';

describe('persistence-client', () => {
  const originalHttpUrl = process.env.NEXT_PUBLIC_GATEWAY_HTTP_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_GATEWAY_HTTP_URL = 'http://127.0.0.1:8787';
  });

  afterEach(() => {
    vi.restoreAllMocks();

    if (originalHttpUrl === undefined) {
      delete process.env.NEXT_PUBLIC_GATEWAY_HTTP_URL;
      return;
    }

    process.env.NEXT_PUBLIC_GATEWAY_HTTP_URL = originalHttpUrl;
  });

  it('builds history URL and parses response payload', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [],
          page: {
            limit: 20,
            offset: 0,
            total: 0,
          },
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        },
      ),
    );

    const response = await fetchMatchHistory();
    expect(response.page.total).toBe(0);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [calledUrl, calledOptions] = fetchSpy.mock.calls[0] ?? [];
    expect(String(calledUrl)).toBe('http://127.0.0.1:8787/api/history?limit=20&offset=0');
    expect(calledOptions).toEqual({
      cache: 'no-store',
    });
  });

  it('throws typed error when response body is invalid', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [{ guestId: 'guest-1' }],
          page: {
            limit: 20,
            offset: 0,
            total: 1,
          },
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        },
      ),
    );

    await expect(fetchLeaderboard()).rejects.toBeInstanceOf(PersistenceHttpError);
  });

  it('requests player stats with encoded path and query', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          guestId: 'guest me',
          latestNickname: 'Alpha',
          overall: {
            matchesPlayed: 1,
            wins: 1,
            winRate: 1,
            totalScore: 5,
            averageRank: 1,
            bestRank: 1,
            lastPlayedAtMs: 10,
          },
          byGame: [],
          recentMatches: [],
          page: {
            limit: 10,
            offset: 0,
            total: 0,
          },
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        },
      ),
    );

    const result = await fetchPlayerStats('guest me', {
      historyLimit: 10,
      historyOffset: 0,
    });
    expect(result.guestId).toBe('guest me');

    const [calledUrl] = fetchSpy.mock.calls[0] ?? [];
    expect(String(calledUrl)).toContain('/api/stats/guest%20me');
    expect(String(calledUrl)).toContain('historyLimit=10');
  });

  it('requests match-by-room endpoint and validates response', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
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
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        },
      ),
    );

    const result = await fetchMatchByRoom('room-1');
    expect(result.item.matchId).toBe('match-1');

    const [calledUrl] = fetchSpy.mock.calls[0] ?? [];
    expect(String(calledUrl)).toBe('http://127.0.0.1:8787/api/matches/room-1');
  });
});
