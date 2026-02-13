import { z } from 'zod';

const idSchema = z.string().min(1).max(64);
const lobbyNameSchema = z.string().min(1).max(64);
const gameIdSchema = z.string().min(1).max(64);

const lobbyPhaseSchema = z.enum(['waiting', 'starting', 'in_game', 'closed']);

const pageSchema = z.object({
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});

export const lobbyDiscoverySortSchema = z.enum([
  'updated_desc',
  'created_desc',
  'connected_desc',
  'connected_asc',
]);

export const lobbyDiscoveryAccessSchema = z.enum(['all', 'open', 'protected']);

export const lobbyDiscoveryQuerySchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().nonnegative().default(0),
  phase: lobbyPhaseSchema.optional(),
  gameId: gameIdSchema.optional(),
  access: lobbyDiscoveryAccessSchema.default('all'),
  search: z.string().min(1).max(64).optional(),
  sort: lobbyDiscoverySortSchema.default('updated_desc'),
});

export const lobbyDiscoveryItemSchema = z.object({
  lobbyId: idSchema,
  lobbyName: lobbyNameSchema,
  phase: lobbyPhaseSchema,
  activeRoomId: idSchema.nullable(),
  selectedGameId: gameIdSchema.nullable(),
  requiresPassword: z.boolean(),
  maxPlayers: z.number().int().positive(),
  playerCount: z.number().int().nonnegative(),
  connectedCount: z.number().int().nonnegative(),
  isJoinable: z.boolean(),
  createdAtMs: z.number().int().nonnegative(),
  updatedAtMs: z.number().int().nonnegative(),
});

export const lobbyDiscoveryResponseSchema = z.object({
  items: z.array(lobbyDiscoveryItemSchema),
  page: pageSchema,
});

export const lobbyQuickJoinQuerySchema = z.object({
  gameId: gameIdSchema.optional(),
});

export const lobbyQuickJoinResponseSchema = z.object({
  item: lobbyDiscoveryItemSchema.nullable(),
});

export type LobbyPhase = z.infer<typeof lobbyPhaseSchema>;
export type LobbyDiscoverySort = z.infer<typeof lobbyDiscoverySortSchema>;
export type LobbyDiscoveryAccess = z.infer<typeof lobbyDiscoveryAccessSchema>;

export type LobbyDiscoveryQuery = z.infer<typeof lobbyDiscoveryQuerySchema>;
export type LobbyDiscoveryItem = z.infer<typeof lobbyDiscoveryItemSchema>;
export type LobbyDiscoveryResponse = z.infer<typeof lobbyDiscoveryResponseSchema>;
export type LobbyQuickJoinQuery = z.infer<typeof lobbyQuickJoinQuerySchema>;
export type LobbyQuickJoinResponse = z.infer<typeof lobbyQuickJoinResponseSchema>;
