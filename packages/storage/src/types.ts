export interface MatchPlayerRecord {
  playerId: string;
  guestId: string;
  nickname: string;
  rank: number;
  score: number;
  alive: boolean;
  eliminatedAtTick: number | null;
}

export interface MatchRecord {
  matchId: string;
  roomId: string;
  lobbyId: string;
  gameId: string;
  seed: number;
  tickRate: number;
  startedAtMs: number;
  endedAtMs: number;
  endReason: string;
  winnerPlayerId: string | null;
  winnerGuestId: string | null;
  players: MatchPlayerRecord[];
}

export interface HistoryQueryInput {
  limit: number;
  offset: number;
  gameId?: string;
  guestId?: string;
}

export interface StatsQueryInput {
  guestId: string;
  gameId?: string;
  historyLimit: number;
  historyOffset: number;
}

export interface LeaderboardQueryInput {
  limit: number;
  offset: number;
  gameId?: string;
}

export interface PageInfo {
  limit: number;
  offset: number;
  total: number;
}

export interface PaginatedResult<T> {
  items: T[];
  page: PageInfo;
}

export interface StatsAggregate {
  matchesPlayed: number;
  wins: number;
  winRate: number;
  totalScore: number;
  averageRank: number;
  bestRank: number | null;
  lastPlayedAtMs: number | null;
}

export interface StatsByGameEntry extends StatsAggregate {
  gameId: string;
}

export interface StatsRecentMatch {
  matchId: string;
  roomId: string;
  lobbyId: string;
  gameId: string;
  endedAtMs: number;
  winnerPlayerId: string | null;
  winnerGuestId: string | null;
  playerResult: MatchPlayerRecord;
}

export interface PlayerStatsResult {
  guestId: string;
  latestNickname: string | null;
  overall: StatsAggregate;
  byGame: StatsByGameEntry[];
  recentMatches: StatsRecentMatch[];
  page: PageInfo;
}

export interface LeaderboardEntry {
  guestId: string;
  latestNickname: string | null;
  matchesPlayed: number;
  wins: number;
  winRate: number;
  totalScore: number;
  averageRank: number;
  bestRank: number | null;
  lastPlayedAtMs: number | null;
}
