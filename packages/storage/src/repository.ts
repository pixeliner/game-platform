import type {
  HistoryQueryInput,
  LeaderboardEntry,
  LeaderboardQueryInput,
  MatchRecord,
  PaginatedResult,
  PlayerStatsResult,
  StatsQueryInput,
} from './types.js';

export interface MatchRepository {
  initialize(): void;
  close(): void;
  recordMatch(input: MatchRecord): void;
  listHistory(query: HistoryQueryInput): PaginatedResult<MatchRecord>;
  getPlayerStats(query: StatsQueryInput): PlayerStatsResult;
  listLeaderboard(query: LeaderboardQueryInput): PaginatedResult<LeaderboardEntry>;
}
