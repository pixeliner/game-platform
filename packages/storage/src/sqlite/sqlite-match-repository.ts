import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import type { MatchRepository } from '../repository.js';
import type {
  HistoryQueryInput,
  LeaderboardEntry,
  LeaderboardQueryInput,
  MatchPlayerRecord,
  MatchRecord,
  PaginatedResult,
  PlayerStatsResult,
  StatsAggregate,
  StatsByGameEntry,
  StatsQueryInput,
  StatsRecentMatch,
} from '../types.js';
import { applySqliteSchema } from './sqlite-schema.js';

interface SqliteMatchRepositoryOptions {
  dbPath: string;
}

interface MatchRow {
  match_id: string;
  room_id: string;
  lobby_id: string;
  game_id: string;
  seed: number;
  tick_rate: number;
  started_at_ms: number;
  ended_at_ms: number;
  end_reason: string;
  winner_player_id: string | null;
  winner_guest_id: string | null;
}

interface MatchPlayerRow {
  player_id: string;
  guest_id: string;
  nickname: string;
  rank: number;
  score: number;
  alive: number;
  eliminated_at_tick: number | null;
}

function computeWinRate(wins: number, matchesPlayed: number): number {
  if (matchesPlayed <= 0) {
    return 0;
  }

  return wins / matchesPlayed;
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'bigint') {
    return Number(value);
  }

  return 0;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  return toNumber(value);
}

function mapAggregateRow(row: {
  matchesPlayed?: unknown;
  wins?: unknown;
  totalScore?: unknown;
  averageRank?: unknown;
  bestRank?: unknown;
  lastPlayedAtMs?: unknown;
}): StatsAggregate {
  const matchesPlayed = toNumber(row.matchesPlayed);
  const wins = toNumber(row.wins);

  return {
    matchesPlayed,
    wins,
    winRate: computeWinRate(wins, matchesPlayed),
    totalScore: toNumber(row.totalScore),
    averageRank: toNumber(row.averageRank),
    bestRank: toNullableNumber(row.bestRank),
    lastPlayedAtMs: toNullableNumber(row.lastPlayedAtMs),
  };
}

function mapPlayerRow(row: MatchPlayerRow): MatchPlayerRecord {
  return {
    playerId: row.player_id,
    guestId: row.guest_id,
    nickname: row.nickname,
    rank: toNumber(row.rank),
    score: toNumber(row.score),
    alive: toNumber(row.alive) === 1,
    eliminatedAtTick: toNullableNumber(row.eliminated_at_tick),
  };
}

function buildHistoryWhereClause(query: {
  gameId?: string;
  guestId?: string;
}): {
  whereSql: string;
  params: string[];
} {
  const conditions: string[] = [];
  const params: string[] = [];

  if (query.gameId) {
    conditions.push('m.game_id = ?');
    params.push(query.gameId);
  }

  if (query.guestId) {
    conditions.push(
      'EXISTS (SELECT 1 FROM match_players mp_filter WHERE mp_filter.match_id = m.match_id AND mp_filter.guest_id = ?)',
    );
    params.push(query.guestId);
  }

  if (conditions.length === 0) {
    return {
      whereSql: '',
      params,
    };
  }

  return {
    whereSql: `WHERE ${conditions.join(' AND ')}`,
    params,
  };
}

export class SqliteMatchRepository implements MatchRepository {
  private readonly database: DatabaseSync;

  public constructor(options: SqliteMatchRepositoryOptions) {
    if (options.dbPath !== ':memory:' && !options.dbPath.startsWith('file::memory:')) {
      mkdirSync(dirname(options.dbPath), { recursive: true });
    }

    this.database = new DatabaseSync(options.dbPath);
    this.initialize();
  }

  public initialize(): void {
    applySqliteSchema(this.database);
  }

  public close(): void {
    this.database.close();
  }

  public recordMatch(input: MatchRecord): void {
    const matchStatement = this.database.prepare(`
      INSERT INTO matches (
        match_id,
        room_id,
        lobby_id,
        game_id,
        seed,
        tick_rate,
        started_at_ms,
        ended_at_ms,
        end_reason,
        winner_player_id,
        winner_guest_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const playerStatement = this.database.prepare(`
      INSERT INTO match_players (
        match_id,
        player_id,
        guest_id,
        nickname,
        rank,
        score,
        alive,
        eliminated_at_tick
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.database.exec('BEGIN');

    try {
      matchStatement.run(
        input.matchId,
        input.roomId,
        input.lobbyId,
        input.gameId,
        input.seed,
        input.tickRate,
        input.startedAtMs,
        input.endedAtMs,
        input.endReason,
        input.winnerPlayerId,
        input.winnerGuestId,
      );

      for (const player of input.players) {
        playerStatement.run(
          input.matchId,
          player.playerId,
          player.guestId,
          player.nickname,
          player.rank,
          player.score,
          player.alive ? 1 : 0,
          player.eliminatedAtTick,
        );
      }

      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  public listHistory(query: HistoryQueryInput): PaginatedResult<MatchRecord> {
    const normalizedQuery: HistoryQueryInput = {
      limit: query.limit,
      offset: query.offset,
      ...(query.gameId ? { gameId: query.gameId } : {}),
      ...(query.guestId ? { guestId: query.guestId } : {}),
    };
    const where = buildHistoryWhereClause(normalizedQuery);

    const totalStatement = this.database.prepare(`SELECT COUNT(*) AS total FROM matches m ${where.whereSql}`);
    const totalRow = totalStatement.get(...where.params) as { total?: unknown } | undefined;
    const total = toNumber(totalRow?.total);

    const matchesStatement = this.database.prepare(`
      SELECT
        m.match_id,
        m.room_id,
        m.lobby_id,
        m.game_id,
        m.seed,
        m.tick_rate,
        m.started_at_ms,
        m.ended_at_ms,
        m.end_reason,
        m.winner_player_id,
        m.winner_guest_id
      FROM matches m
      ${where.whereSql}
      ORDER BY m.ended_at_ms DESC, m.match_id DESC
      LIMIT ? OFFSET ?
    `);

    const matchRows = matchesStatement.all(
      ...where.params,
      normalizedQuery.limit,
      normalizedQuery.offset,
    ) as unknown as MatchRow[];

    const playersByMatchStatement = this.database.prepare(`
      SELECT
        mp.player_id,
        mp.guest_id,
        mp.nickname,
        mp.rank,
        mp.score,
        mp.alive,
        mp.eliminated_at_tick
      FROM match_players mp
      WHERE mp.match_id = ?
      ORDER BY mp.rank ASC, mp.guest_id ASC
    `);

    const items = matchRows.map((row) => {
      const playerRows = playersByMatchStatement.all(row.match_id) as unknown as MatchPlayerRow[];
      return {
        matchId: row.match_id,
        roomId: row.room_id,
        lobbyId: row.lobby_id,
        gameId: row.game_id,
        seed: toNumber(row.seed),
        tickRate: toNumber(row.tick_rate),
        startedAtMs: toNumber(row.started_at_ms),
        endedAtMs: toNumber(row.ended_at_ms),
        endReason: row.end_reason,
        winnerPlayerId: row.winner_player_id,
        winnerGuestId: row.winner_guest_id,
        players: playerRows.map(mapPlayerRow),
      } satisfies MatchRecord;
    });

    return {
      items,
      page: {
        limit: normalizedQuery.limit,
        offset: normalizedQuery.offset,
        total,
      },
    };
  }

  public getPlayerStats(query: StatsQueryInput): PlayerStatsResult {
    const aggregateParams: string[] = [query.guestId];
    let aggregateWhereSql = 'WHERE mp.guest_id = ?';
    if (query.gameId) {
      aggregateWhereSql += ' AND m.game_id = ?';
      aggregateParams.push(query.gameId);
    }

    const overallStatement = this.database.prepare(`
      SELECT
        COUNT(*) AS matchesPlayed,
        SUM(CASE WHEN mp.rank = 1 THEN 1 ELSE 0 END) AS wins,
        COALESCE(SUM(mp.score), 0) AS totalScore,
        COALESCE(AVG(mp.rank), 0) AS averageRank,
        MIN(mp.rank) AS bestRank,
        MAX(m.ended_at_ms) AS lastPlayedAtMs
      FROM match_players mp
      JOIN matches m ON m.match_id = mp.match_id
      ${aggregateWhereSql}
    `);

    const overallRow = overallStatement.get(...aggregateParams) as {
      matchesPlayed?: unknown;
      wins?: unknown;
      totalScore?: unknown;
      averageRank?: unknown;
      bestRank?: unknown;
      lastPlayedAtMs?: unknown;
    };
    const overall = mapAggregateRow(overallRow);

    const latestNicknameStatement = this.database.prepare(`
      SELECT mp.nickname
      FROM match_players mp
      JOIN matches m ON m.match_id = mp.match_id
      WHERE mp.guest_id = ?
      ORDER BY m.ended_at_ms DESC, m.match_id DESC
      LIMIT 1
    `);
    const latestNicknameRow = latestNicknameStatement.get(query.guestId) as { nickname?: string } | undefined;

    const byGameParams: string[] = [query.guestId];
    let byGameWhereSql = 'WHERE mp.guest_id = ?';
    if (query.gameId) {
      byGameWhereSql += ' AND m.game_id = ?';
      byGameParams.push(query.gameId);
    }

    const byGameStatement = this.database.prepare(`
      SELECT
        m.game_id AS gameId,
        COUNT(*) AS matchesPlayed,
        SUM(CASE WHEN mp.rank = 1 THEN 1 ELSE 0 END) AS wins,
        COALESCE(SUM(mp.score), 0) AS totalScore,
        COALESCE(AVG(mp.rank), 0) AS averageRank,
        MIN(mp.rank) AS bestRank,
        MAX(m.ended_at_ms) AS lastPlayedAtMs
      FROM match_players mp
      JOIN matches m ON m.match_id = mp.match_id
      ${byGameWhereSql}
      GROUP BY m.game_id
      ORDER BY m.game_id ASC
    `);

    const byGameRows = byGameStatement.all(...byGameParams) as unknown as Array<{
      gameId: string;
      matchesPlayed?: unknown;
      wins?: unknown;
      totalScore?: unknown;
      averageRank?: unknown;
      bestRank?: unknown;
      lastPlayedAtMs?: unknown;
    }>;

    const byGame: StatsByGameEntry[] = byGameRows.map((row) => ({
      gameId: row.gameId,
      ...mapAggregateRow(row),
    }));

    const recentWhereClauses = ['mp.guest_id = ?'];
    const recentCountParams: string[] = [query.guestId];
    if (query.gameId) {
      recentWhereClauses.push('m.game_id = ?');
      recentCountParams.push(query.gameId);
    }
    const recentWhereSql = `WHERE ${recentWhereClauses.join(' AND ')}`;

    const recentCountStatement = this.database.prepare(`
      SELECT COUNT(*) AS total
      FROM match_players mp
      JOIN matches m ON m.match_id = mp.match_id
      ${recentWhereSql}
    `);
    const recentCountRow = recentCountStatement.get(...recentCountParams) as { total?: unknown } | undefined;
    const recentTotal = toNumber(recentCountRow?.total);

    const recentMatchesStatement = this.database.prepare(`
      SELECT
        m.match_id,
        m.room_id,
        m.lobby_id,
        m.game_id,
        m.ended_at_ms,
        m.winner_player_id,
        m.winner_guest_id,
        mp.player_id,
        mp.guest_id,
        mp.nickname,
        mp.rank,
        mp.score,
        mp.alive,
        mp.eliminated_at_tick
      FROM match_players mp
      JOIN matches m ON m.match_id = mp.match_id
      ${recentWhereSql}
      ORDER BY m.ended_at_ms DESC, m.match_id DESC
      LIMIT ? OFFSET ?
    `);

    const recentRows = recentMatchesStatement.all(
      ...recentCountParams,
      query.historyLimit,
      query.historyOffset,
    ) as unknown as Array<{
      match_id: string;
      room_id: string;
      lobby_id: string;
      game_id: string;
      ended_at_ms: number;
      winner_player_id: string | null;
      winner_guest_id: string | null;
      player_id: string;
      guest_id: string;
      nickname: string;
      rank: number;
      score: number;
      alive: number;
      eliminated_at_tick: number | null;
    }>;

    const recentMatches: StatsRecentMatch[] = recentRows.map((row) => ({
      matchId: row.match_id,
      roomId: row.room_id,
      lobbyId: row.lobby_id,
      gameId: row.game_id,
      endedAtMs: toNumber(row.ended_at_ms),
      winnerPlayerId: row.winner_player_id,
      winnerGuestId: row.winner_guest_id,
      playerResult: {
        playerId: row.player_id,
        guestId: row.guest_id,
        nickname: row.nickname,
        rank: toNumber(row.rank),
        score: toNumber(row.score),
        alive: toNumber(row.alive) === 1,
        eliminatedAtTick: toNullableNumber(row.eliminated_at_tick),
      },
    }));

    return {
      guestId: query.guestId,
      latestNickname: latestNicknameRow?.nickname ?? null,
      overall,
      byGame,
      recentMatches,
      page: {
        limit: query.historyLimit,
        offset: query.historyOffset,
        total: recentTotal,
      },
    };
  }

  public listLeaderboard(query: LeaderboardQueryInput): PaginatedResult<LeaderboardEntry> {
    const whereConditions: string[] = [];
    const whereParams: string[] = [];

    if (query.gameId) {
      whereConditions.push('m.game_id = ?');
      whereParams.push(query.gameId);
    }

    const whereSql = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const totalStatement = this.database.prepare(`
      SELECT COUNT(DISTINCT mp.guest_id) AS total
      FROM match_players mp
      JOIN matches m ON m.match_id = mp.match_id
      ${whereSql}
    `);
    const totalRow = totalStatement.get(...whereParams) as { total?: unknown } | undefined;
    const total = toNumber(totalRow?.total);

    const leaderboardStatement = this.database.prepare(`
      SELECT
        mp.guest_id AS guestId,
        COUNT(*) AS matchesPlayed,
        SUM(CASE WHEN mp.rank = 1 THEN 1 ELSE 0 END) AS wins,
        COALESCE(SUM(mp.score), 0) AS totalScore,
        COALESCE(AVG(mp.rank), 0) AS averageRank,
        MIN(mp.rank) AS bestRank,
        MAX(m.ended_at_ms) AS lastPlayedAtMs
      FROM match_players mp
      JOIN matches m ON m.match_id = mp.match_id
      ${whereSql}
      GROUP BY mp.guest_id
      ORDER BY
        wins DESC,
        totalScore DESC,
        averageRank ASC,
        lastPlayedAtMs DESC,
        guestId ASC
      LIMIT ? OFFSET ?
    `);

    const rows = leaderboardStatement.all(...whereParams, query.limit, query.offset) as unknown as Array<{
      guestId: string;
      matchesPlayed?: unknown;
      wins?: unknown;
      totalScore?: unknown;
      averageRank?: unknown;
      bestRank?: unknown;
      lastPlayedAtMs?: unknown;
    }>;

    const latestNicknameStatement = this.database.prepare(`
      SELECT mp.nickname
      FROM match_players mp
      JOIN matches m ON m.match_id = mp.match_id
      WHERE mp.guest_id = ?
      ORDER BY m.ended_at_ms DESC, m.match_id DESC
      LIMIT 1
    `);

    const items: LeaderboardEntry[] = rows.map((row) => {
      const aggregate = mapAggregateRow(row);
      const latestNicknameRow = latestNicknameStatement.get(row.guestId) as { nickname?: string } | undefined;

      return {
        guestId: row.guestId,
        latestNickname: latestNicknameRow?.nickname ?? null,
        matchesPlayed: aggregate.matchesPlayed,
        wins: aggregate.wins,
        winRate: aggregate.winRate,
        totalScore: aggregate.totalScore,
        averageRank: aggregate.averageRank,
        bestRank: aggregate.bestRank,
        lastPlayedAtMs: aggregate.lastPlayedAtMs,
      };
    });

    return {
      items,
      page: {
        limit: query.limit,
        offset: query.offset,
        total,
      },
    };
  }
}
