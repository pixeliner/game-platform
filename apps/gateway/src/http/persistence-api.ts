import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  historyQuerySchema,
  leaderboardQuerySchema,
  leaderboardResponseSchema,
  matchByRoomPathParamsSchema,
  matchByRoomResponseSchema,
  matchHistoryResponseSchema,
  playerStatsPathParamsSchema,
  playerStatsQuerySchema,
  playerStatsResponseSchema,
} from '@game-platform/protocol';
import type { MatchRepository } from '@game-platform/storage';

interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

function parseInteger(value: string | null): number | undefined {
  if (value === null || value.length === 0) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return Number.NaN;
  }

  return parsed;
}

function writeJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify(body));
}

function writeError(
  response: ServerResponse,
  statusCode: number,
  code: string,
  message: string,
  details?: unknown,
): void {
  const body: ApiErrorBody = {
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
  };

  writeJson(response, statusCode, body);
}

export function createPersistenceApiHandler(repository: MatchRepository): {
  handle(request: IncomingMessage, response: ServerResponse): boolean;
} {
  return {
    handle(request: IncomingMessage, response: ServerResponse): boolean {
      const requestUrl = request.url ?? '/';
      const url = new URL(requestUrl, 'http://gateway.local');
      const path = url.pathname;

      if (!path.startsWith('/api/')) {
        return false;
      }

      if (request.method !== 'GET') {
        writeError(response, 405, 'method_not_allowed', 'Only GET is supported for persistence API.');
        return true;
      }

      if (path === '/api/history') {
        const parsedQuery = historyQuerySchema.safeParse({
          limit: parseInteger(url.searchParams.get('limit')),
          offset: parseInteger(url.searchParams.get('offset')),
          gameId: url.searchParams.get('gameId') ?? undefined,
          guestId: url.searchParams.get('guestId') ?? undefined,
        });

        if (!parsedQuery.success) {
          writeError(response, 400, 'invalid_query', 'Invalid history query parameters.', parsedQuery.error.issues);
          return true;
        }

        const historyQuery = parsedQuery.data;
        const result = repository.listHistory({
          limit: historyQuery.limit,
          offset: historyQuery.offset,
          ...(historyQuery.gameId ? { gameId: historyQuery.gameId } : {}),
          ...(historyQuery.guestId ? { guestId: historyQuery.guestId } : {}),
        });
        const payload = matchHistoryResponseSchema.safeParse(result);
        if (!payload.success) {
          writeError(response, 500, 'invalid_response', 'Generated history payload is invalid.', payload.error.issues);
          return true;
        }

        writeJson(response, 200, payload.data);
        return true;
      }

      const matchByRoomMatch = path.match(/^\/api\/matches\/([^/]+)$/);
      if (matchByRoomMatch) {
        const parsedPath = matchByRoomPathParamsSchema.safeParse({
          roomId: decodeURIComponent(matchByRoomMatch[1] ?? ''),
        });
        if (!parsedPath.success) {
          writeError(response, 400, 'invalid_path', 'Invalid match path parameters.', parsedPath.error.issues);
          return true;
        }

        const match = repository.getMatchByRoomId(parsedPath.data.roomId);
        if (!match) {
          writeError(response, 404, 'not_found', 'Match was not found for room.');
          return true;
        }

        const payload = matchByRoomResponseSchema.safeParse({
          item: match,
        });
        if (!payload.success) {
          writeError(response, 500, 'invalid_response', 'Generated match payload is invalid.', payload.error.issues);
          return true;
        }

        writeJson(response, 200, payload.data);
        return true;
      }

      if (path === '/api/leaderboard') {
        const parsedQuery = leaderboardQuerySchema.safeParse({
          limit: parseInteger(url.searchParams.get('limit')),
          offset: parseInteger(url.searchParams.get('offset')),
          gameId: url.searchParams.get('gameId') ?? undefined,
        });

        if (!parsedQuery.success) {
          writeError(
            response,
            400,
            'invalid_query',
            'Invalid leaderboard query parameters.',
            parsedQuery.error.issues,
          );
          return true;
        }

        const leaderboardQuery = parsedQuery.data;
        const result = repository.listLeaderboard({
          limit: leaderboardQuery.limit,
          offset: leaderboardQuery.offset,
          ...(leaderboardQuery.gameId ? { gameId: leaderboardQuery.gameId } : {}),
        });
        const payload = leaderboardResponseSchema.safeParse(result);
        if (!payload.success) {
          writeError(
            response,
            500,
            'invalid_response',
            'Generated leaderboard payload is invalid.',
            payload.error.issues,
          );
          return true;
        }

        writeJson(response, 200, payload.data);
        return true;
      }

      const statsMatch = path.match(/^\/api\/stats\/([^/]+)$/);
      if (statsMatch) {
        const parsedPath = playerStatsPathParamsSchema.safeParse({
          guestId: decodeURIComponent(statsMatch[1] ?? ''),
        });
        if (!parsedPath.success) {
          writeError(response, 400, 'invalid_path', 'Invalid stats path parameters.', parsedPath.error.issues);
          return true;
        }

        const parsedQuery = playerStatsQuerySchema.safeParse({
          gameId: url.searchParams.get('gameId') ?? undefined,
          historyLimit: parseInteger(url.searchParams.get('historyLimit')),
          historyOffset: parseInteger(url.searchParams.get('historyOffset')),
        });
        if (!parsedQuery.success) {
          writeError(response, 400, 'invalid_query', 'Invalid stats query parameters.', parsedQuery.error.issues);
          return true;
        }

        const statsQuery = parsedQuery.data;
        const result = repository.getPlayerStats({
          guestId: parsedPath.data.guestId,
          historyLimit: statsQuery.historyLimit,
          historyOffset: statsQuery.historyOffset,
          ...(statsQuery.gameId ? { gameId: statsQuery.gameId } : {}),
        });

        const payload = playerStatsResponseSchema.safeParse(result);
        if (!payload.success) {
          writeError(response, 500, 'invalid_response', 'Generated stats payload is invalid.', payload.error.issues);
          return true;
        }

        writeJson(response, 200, payload.data);
        return true;
      }

      writeError(response, 404, 'not_found', 'Persistence API route not found.');
      return true;
    },
  };
}
