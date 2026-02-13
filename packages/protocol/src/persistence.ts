import { z } from 'zod';

const idSchema = z.string().min(1).max(64);
const gameIdSchema = z.string().min(1).max(64);
const nicknameSchema = z.string().min(1).max(32);

const pageSchema = z.object({
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});

export const historyQuerySchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().nonnegative().default(0),
  gameId: gameIdSchema.optional(),
  guestId: idSchema.optional(),
});

export const playerStatsQuerySchema = z.object({
  gameId: gameIdSchema.optional(),
  historyLimit: z.number().int().min(1).max(50).default(10),
  historyOffset: z.number().int().nonnegative().default(0),
});

export const leaderboardQuerySchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().nonnegative().default(0),
  gameId: gameIdSchema.optional(),
});

export const playerStatsPathParamsSchema = z.object({
  guestId: idSchema,
});

export const matchByRoomPathParamsSchema = z.object({
  roomId: idSchema,
});

export const matchPlayerResultSchema = z.object({
  playerId: idSchema,
  guestId: idSchema,
  nickname: nicknameSchema,
  rank: z.number().int().positive(),
  score: z.number().int(),
  alive: z.boolean(),
  eliminatedAtTick: z.number().int().nonnegative().nullable(),
});

export const matchHistoryItemSchema = z.object({
  matchId: idSchema,
  roomId: idSchema,
  lobbyId: idSchema,
  gameId: gameIdSchema,
  seed: z.number().int(),
  tickRate: z.number().int().positive(),
  startedAtMs: z.number().int().nonnegative(),
  endedAtMs: z.number().int().nonnegative(),
  endReason: z.string().min(1).max(64),
  winnerPlayerId: idSchema.nullable(),
  winnerGuestId: idSchema.nullable(),
  players: z.array(matchPlayerResultSchema),
});

export const matchHistoryResponseSchema = z.object({
  items: z.array(matchHistoryItemSchema),
  page: pageSchema,
});

export const matchByRoomResponseSchema = z.object({
  item: matchHistoryItemSchema,
});

const statsAggregateSchema = z.object({
  matchesPlayed: z.number().int().nonnegative(),
  wins: z.number().int().nonnegative(),
  winRate: z.number().min(0).max(1),
  totalScore: z.number().int(),
  averageRank: z.number().min(0),
  bestRank: z.number().int().positive().nullable(),
  lastPlayedAtMs: z.number().int().nonnegative().nullable(),
});

export const playerStatsByGameSchema = statsAggregateSchema.extend({
  gameId: gameIdSchema,
});

export const playerStatsRecentMatchSchema = z.object({
  matchId: idSchema,
  roomId: idSchema,
  lobbyId: idSchema,
  gameId: gameIdSchema,
  endedAtMs: z.number().int().nonnegative(),
  winnerPlayerId: idSchema.nullable(),
  winnerGuestId: idSchema.nullable(),
  playerResult: matchPlayerResultSchema,
});

export const playerStatsResponseSchema = z.object({
  guestId: idSchema,
  latestNickname: nicknameSchema.nullable(),
  overall: statsAggregateSchema,
  byGame: z.array(playerStatsByGameSchema),
  recentMatches: z.array(playerStatsRecentMatchSchema),
  page: pageSchema,
});

export const leaderboardEntrySchema = z.object({
  guestId: idSchema,
  latestNickname: nicknameSchema.nullable(),
  matchesPlayed: z.number().int().nonnegative(),
  wins: z.number().int().nonnegative(),
  winRate: z.number().min(0).max(1),
  totalScore: z.number().int(),
  averageRank: z.number().min(0),
  bestRank: z.number().int().positive().nullable(),
  lastPlayedAtMs: z.number().int().nonnegative().nullable(),
});

export const leaderboardResponseSchema = z.object({
  items: z.array(leaderboardEntrySchema),
  page: pageSchema,
});

export type HistoryQuery = z.infer<typeof historyQuerySchema>;
export type PlayerStatsQuery = z.infer<typeof playerStatsQuerySchema>;
export type LeaderboardQuery = z.infer<typeof leaderboardQuerySchema>;
export type PlayerStatsPathParams = z.infer<typeof playerStatsPathParamsSchema>;
export type MatchByRoomPathParams = z.infer<typeof matchByRoomPathParamsSchema>;

export type MatchPlayerResult = z.infer<typeof matchPlayerResultSchema>;
export type MatchHistoryItem = z.infer<typeof matchHistoryItemSchema>;
export type MatchHistoryResponse = z.infer<typeof matchHistoryResponseSchema>;
export type MatchByRoomResponse = z.infer<typeof matchByRoomResponseSchema>;
export type PlayerStatsByGame = z.infer<typeof playerStatsByGameSchema>;
export type PlayerStatsRecentMatch = z.infer<typeof playerStatsRecentMatchSchema>;
export type PlayerStatsResponse = z.infer<typeof playerStatsResponseSchema>;
export type LeaderboardEntry = z.infer<typeof leaderboardEntrySchema>;
export type LeaderboardResponse = z.infer<typeof leaderboardResponseSchema>;
