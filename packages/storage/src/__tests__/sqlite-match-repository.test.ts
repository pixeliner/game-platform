import { afterEach, describe, expect, it } from 'vitest';

import { SqliteMatchRepository } from '../sqlite/sqlite-match-repository.js';
import type { MatchRecord } from '../types.js';

function createMatchRecord(input: {
  matchId: string;
  roomId: string;
  lobbyId: string;
  gameId: string;
  seed: number;
  startedAtMs: number;
  endedAtMs: number;
  winnerPlayerId: string | null;
  winnerGuestId: string | null;
  players: MatchRecord['players'];
}): MatchRecord {
  return {
    matchId: input.matchId,
    roomId: input.roomId,
    lobbyId: input.lobbyId,
    gameId: input.gameId,
    seed: input.seed,
    tickRate: 20,
    startedAtMs: input.startedAtMs,
    endedAtMs: input.endedAtMs,
    endReason: 'game_over',
    winnerPlayerId: input.winnerPlayerId,
    winnerGuestId: input.winnerGuestId,
    players: input.players,
  };
}

describe('SqliteMatchRepository', () => {
  const repositories: SqliteMatchRepository[] = [];

  afterEach(() => {
    for (const repository of repositories) {
      repository.close();
    }
    repositories.length = 0;
  });

  function createRepository(): SqliteMatchRepository {
    const repository = new SqliteMatchRepository({
      dbPath: ':memory:',
    });
    repositories.push(repository);
    return repository;
  }

  function seedMatches(repository: SqliteMatchRepository): void {
    repository.recordMatch(
      createMatchRecord({
        matchId: 'match-1',
        roomId: 'room-1',
        lobbyId: 'lobby-1',
        gameId: 'bomberman',
        seed: 100,
        startedAtMs: 1000,
        endedAtMs: 2000,
        winnerPlayerId: 'player-a',
        winnerGuestId: 'guest-a',
        players: [
          {
            playerId: 'player-a',
            guestId: 'guest-a',
            nickname: 'AlphaOld',
            rank: 1,
            score: 5,
            alive: true,
            eliminatedAtTick: null,
          },
          {
            playerId: 'player-b',
            guestId: 'guest-b',
            nickname: 'Bravo',
            rank: 2,
            score: 2,
            alive: false,
            eliminatedAtTick: 31,
          },
        ],
      }),
    );

    repository.recordMatch(
      createMatchRecord({
        matchId: 'match-2',
        roomId: 'room-2',
        lobbyId: 'lobby-2',
        gameId: 'bomberman',
        seed: 200,
        startedAtMs: 3000,
        endedAtMs: 4000,
        winnerPlayerId: 'player-c',
        winnerGuestId: 'guest-c',
        players: [
          {
            playerId: 'player-c',
            guestId: 'guest-c',
            nickname: 'Charlie',
            rank: 1,
            score: 6,
            alive: true,
            eliminatedAtTick: null,
          },
          {
            playerId: 'player-a',
            guestId: 'guest-a',
            nickname: 'AlphaNew',
            rank: 2,
            score: 1,
            alive: false,
            eliminatedAtTick: 52,
          },
        ],
      }),
    );

    repository.recordMatch(
      createMatchRecord({
        matchId: 'match-3',
        roomId: 'room-3',
        lobbyId: 'lobby-3',
        gameId: 'arena',
        seed: 300,
        startedAtMs: 5000,
        endedAtMs: 6000,
        winnerPlayerId: 'player-b',
        winnerGuestId: 'guest-b',
        players: [
          {
            playerId: 'player-b',
            guestId: 'guest-b',
            nickname: 'BravoX',
            rank: 1,
            score: 4,
            alive: true,
            eliminatedAtTick: null,
          },
          {
            playerId: 'player-c',
            guestId: 'guest-c',
            nickname: 'Charlie',
            rank: 2,
            score: 1,
            alive: false,
            eliminatedAtTick: 67,
          },
        ],
      }),
    );
  }

  it('bootstraps schema idempotently', () => {
    const repository = createRepository();
    repository.initialize();

    const history = repository.listHistory({
      limit: 20,
      offset: 0,
    });

    expect(history.items).toEqual([]);
    expect(history.page.total).toBe(0);
  });

  it('stores matches and supports history filters + pagination', () => {
    const repository = createRepository();
    seedMatches(repository);

    const all = repository.listHistory({
      limit: 20,
      offset: 0,
    });
    expect(all.items.map((item) => item.matchId)).toEqual(['match-3', 'match-2', 'match-1']);
    expect(all.page.total).toBe(3);

    const byGame = repository.listHistory({
      limit: 20,
      offset: 0,
      gameId: 'bomberman',
    });
    expect(byGame.items.map((item) => item.matchId)).toEqual(['match-2', 'match-1']);
    expect(byGame.page.total).toBe(2);

    const byGuest = repository.listHistory({
      limit: 20,
      offset: 0,
      guestId: 'guest-a',
    });
    expect(byGuest.items.map((item) => item.matchId)).toEqual(['match-2', 'match-1']);
    expect(byGuest.page.total).toBe(2);

    const page = repository.listHistory({
      limit: 1,
      offset: 1,
    });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.matchId).toBe('match-2');
    expect(page.page.total).toBe(3);
  });

  it('computes aggregate stats for a guest with deterministic recent history', () => {
    const repository = createRepository();
    seedMatches(repository);

    const stats = repository.getPlayerStats({
      guestId: 'guest-a',
      historyLimit: 10,
      historyOffset: 0,
    });

    expect(stats.latestNickname).toBe('AlphaNew');
    expect(stats.overall.matchesPlayed).toBe(2);
    expect(stats.overall.wins).toBe(1);
    expect(stats.overall.totalScore).toBe(6);
    expect(stats.overall.averageRank).toBe(1.5);
    expect(stats.overall.winRate).toBe(0.5);
    expect(stats.overall.bestRank).toBe(1);
    expect(stats.overall.lastPlayedAtMs).toBe(4000);
    expect(stats.byGame).toHaveLength(1);
    expect(stats.byGame[0]?.gameId).toBe('bomberman');
    expect(stats.recentMatches.map((match) => match.matchId)).toEqual(['match-2', 'match-1']);

    const pagedStats = repository.getPlayerStats({
      guestId: 'guest-a',
      gameId: 'bomberman',
      historyLimit: 1,
      historyOffset: 1,
    });
    expect(pagedStats.recentMatches).toHaveLength(1);
    expect(pagedStats.recentMatches[0]?.matchId).toBe('match-1');
    expect(pagedStats.page.total).toBe(2);
  });

  it('ranks leaderboard entries deterministically', () => {
    const repository = createRepository();
    seedMatches(repository);

    const leaderboard = repository.listLeaderboard({
      limit: 20,
      offset: 0,
    });

    expect(leaderboard.items.map((item) => item.guestId)).toEqual(['guest-c', 'guest-b', 'guest-a']);
    expect(leaderboard.items[0]?.latestNickname).toBe('Charlie');
    expect(leaderboard.items[1]?.latestNickname).toBe('BravoX');
    expect(leaderboard.page.total).toBe(3);
  });
});
