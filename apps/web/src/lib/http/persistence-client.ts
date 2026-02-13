import {
  historyQuerySchema,
  leaderboardQuerySchema,
  matchHistoryResponseSchema,
  playerStatsPathParamsSchema,
  playerStatsQuerySchema,
  playerStatsResponseSchema,
  leaderboardResponseSchema,
  type HistoryQuery,
  type LeaderboardQuery,
  type MatchHistoryResponse,
  type PlayerStatsQuery,
  type PlayerStatsResponse,
  type LeaderboardResponse,
} from '@game-platform/protocol';

import { resolveGatewayHttpUrl } from '@/src/lib/env';

export class PersistenceHttpError extends Error {
  public readonly status: number;
  public readonly details: unknown;

  public constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'PersistenceHttpError';
    this.status = status;
    this.details = details;
  }
}

function buildUrl(path: string, query: Record<string, string | number | undefined>): string {
  const base = resolveGatewayHttpUrl().value;
  const url = new URL(path, `${base}/`);

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }

    url.searchParams.set(key, String(value));
  }

  return url.toString();
}

async function fetchJson<T>(
  url: string,
  schema: {
    safeParse: (input: unknown) => { success: true; data: T } | { success: false; error: { issues: unknown[] } };
  },
): Promise<T> {
  const response = await fetch(url, {
    cache: 'no-store',
  });

  const json = await response.json();
  if (!response.ok) {
    throw new PersistenceHttpError(response.status, 'Gateway persistence request failed.', json);
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new PersistenceHttpError(500, 'Gateway persistence response failed validation.', parsed.error.issues);
  }

  return parsed.data;
}

export type FetchHistoryInput = Partial<HistoryQuery>;

export async function fetchMatchHistory(input: FetchHistoryInput = {}): Promise<MatchHistoryResponse> {
  const query = historyQuerySchema.parse({
    limit: input.limit,
    offset: input.offset,
    gameId: input.gameId,
    guestId: input.guestId,
  });

  const url = buildUrl('/api/history', {
    limit: query.limit,
    offset: query.offset,
    gameId: query.gameId,
    guestId: query.guestId,
  });

  return fetchJson(url, matchHistoryResponseSchema);
}

export type FetchLeaderboardInput = Partial<LeaderboardQuery>;

export async function fetchLeaderboard(input: FetchLeaderboardInput = {}): Promise<LeaderboardResponse> {
  const query = leaderboardQuerySchema.parse({
    limit: input.limit,
    offset: input.offset,
    gameId: input.gameId,
  });

  const url = buildUrl('/api/leaderboard', {
    limit: query.limit,
    offset: query.offset,
    gameId: query.gameId,
  });

  return fetchJson(url, leaderboardResponseSchema);
}

export type FetchPlayerStatsInput = Partial<PlayerStatsQuery>;

export async function fetchPlayerStats(
  guestId: string,
  input: FetchPlayerStatsInput = {},
): Promise<PlayerStatsResponse> {
  const path = playerStatsPathParamsSchema.parse({
    guestId,
  });
  const query = playerStatsQuerySchema.parse({
    gameId: input.gameId,
    historyLimit: input.historyLimit,
    historyOffset: input.historyOffset,
  });

  const url = buildUrl(`/api/stats/${encodeURIComponent(path.guestId)}`, {
    gameId: query.gameId,
    historyLimit: query.historyLimit,
    historyOffset: query.historyOffset,
  });

  return fetchJson(url, playerStatsResponseSchema);
}
