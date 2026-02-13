import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  lobbyDiscoveryQuerySchema,
  lobbyDiscoveryResponseSchema,
  lobbyQuickJoinQuerySchema,
  lobbyQuickJoinResponseSchema,
  type LobbyDiscoveryItem,
} from '@game-platform/protocol';

import type { LobbyStateMachine } from '../lobby/lobby-state-machine.js';

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

function sortDiscoveryItems(items: LobbyDiscoveryItem[], sort: string): LobbyDiscoveryItem[] {
  const copy = [...items];

  switch (sort) {
    case 'created_desc':
      copy.sort((a, b) => {
        if (a.createdAtMs === b.createdAtMs) {
          return a.lobbyId.localeCompare(b.lobbyId);
        }

        return b.createdAtMs - a.createdAtMs;
      });
      return copy;
    case 'connected_desc':
      copy.sort((a, b) => {
        if (a.connectedCount === b.connectedCount) {
          if (a.updatedAtMs === b.updatedAtMs) {
            return a.lobbyId.localeCompare(b.lobbyId);
          }

          return b.updatedAtMs - a.updatedAtMs;
        }

        return b.connectedCount - a.connectedCount;
      });
      return copy;
    case 'connected_asc':
      copy.sort((a, b) => {
        if (a.connectedCount === b.connectedCount) {
          if (a.updatedAtMs === b.updatedAtMs) {
            return a.lobbyId.localeCompare(b.lobbyId);
          }

          return b.updatedAtMs - a.updatedAtMs;
        }

        return a.connectedCount - b.connectedCount;
      });
      return copy;
    case 'updated_desc':
    default:
      copy.sort((a, b) => {
        if (a.updatedAtMs === b.updatedAtMs) {
          return a.lobbyId.localeCompare(b.lobbyId);
        }

        return b.updatedAtMs - a.updatedAtMs;
      });
      return copy;
  }
}

function pickQuickJoinCandidate(
  items: LobbyDiscoveryItem[],
  input: {
    gameId?: string | undefined;
  },
): LobbyDiscoveryItem | null {
  const eligible = items
    .filter((item) => item.phase === 'waiting')
    .filter((item) => item.isJoinable)
    .filter((item) => !item.requiresPassword)
    .filter((item) => {
      if (!input.gameId) {
        return true;
      }

      return item.selectedGameId === null || item.selectedGameId === input.gameId;
    })
    .sort((a, b) => {
      if (a.connectedCount === b.connectedCount) {
        if (a.updatedAtMs === b.updatedAtMs) {
          return a.lobbyId.localeCompare(b.lobbyId);
        }

        return b.updatedAtMs - a.updatedAtMs;
      }

      return b.connectedCount - a.connectedCount;
    });

  return eligible[0] ?? null;
}

export function createLobbyDiscoveryApiHandler(stateMachine: LobbyStateMachine): {
  handle(request: IncomingMessage, response: ServerResponse): boolean;
} {
  return {
    handle(request: IncomingMessage, response: ServerResponse): boolean {
      const requestUrl = request.url ?? '/';
      const url = new URL(requestUrl, 'http://gateway.local');
      const path = url.pathname;

      if (!path.startsWith('/api/lobbies')) {
        return false;
      }

      if (request.method !== 'GET') {
        writeError(response, 405, 'method_not_allowed', 'Only GET is supported for lobby discovery API.');
        return true;
      }

      if (path === '/api/lobbies') {
        const parsedQuery = lobbyDiscoveryQuerySchema.safeParse({
          limit: parseInteger(url.searchParams.get('limit')),
          offset: parseInteger(url.searchParams.get('offset')),
          phase: url.searchParams.get('phase') ?? undefined,
          gameId: url.searchParams.get('gameId') ?? undefined,
          access: url.searchParams.get('access') ?? undefined,
          search: url.searchParams.get('search') ?? undefined,
          sort: url.searchParams.get('sort') ?? undefined,
        });

        if (!parsedQuery.success) {
          writeError(response, 400, 'invalid_query', 'Invalid lobby discovery query parameters.', parsedQuery.error.issues);
          return true;
        }

        const query = parsedQuery.data;
        const normalizedSearch = query.search?.trim().toLowerCase();

        let items = stateMachine.listLobbyViews();

        if (query.phase) {
          items = items.filter((item) => item.phase === query.phase);
        }

        if (query.gameId) {
          items = items.filter((item) => item.selectedGameId === query.gameId);
        }

        if (query.access === 'open') {
          items = items.filter((item) => !item.requiresPassword);
        } else if (query.access === 'protected') {
          items = items.filter((item) => item.requiresPassword);
        }

        if (normalizedSearch && normalizedSearch.length > 0) {
          items = items.filter((item) => {
            return (
              item.lobbyId.toLowerCase().includes(normalizedSearch) ||
              item.lobbyName.toLowerCase().includes(normalizedSearch)
            );
          });
        }

        const sorted = sortDiscoveryItems(items, query.sort);
        const paged = sorted.slice(query.offset, query.offset + query.limit);
        const payload = lobbyDiscoveryResponseSchema.safeParse({
          items: paged,
          page: {
            limit: query.limit,
            offset: query.offset,
            total: sorted.length,
          },
        });

        if (!payload.success) {
          writeError(response, 500, 'invalid_response', 'Generated lobby discovery payload is invalid.', payload.error.issues);
          return true;
        }

        writeJson(response, 200, payload.data);
        return true;
      }

      if (path === '/api/lobbies/quick-join') {
        const parsedQuery = lobbyQuickJoinQuerySchema.safeParse({
          gameId: url.searchParams.get('gameId') ?? undefined,
        });

        if (!parsedQuery.success) {
          writeError(response, 400, 'invalid_query', 'Invalid quick join query parameters.', parsedQuery.error.issues);
          return true;
        }

        const candidate = pickQuickJoinCandidate(stateMachine.listLobbyViews(), parsedQuery.data);
        const payload = lobbyQuickJoinResponseSchema.safeParse({
          item: candidate,
        });

        if (!payload.success) {
          writeError(response, 500, 'invalid_response', 'Generated quick join payload is invalid.', payload.error.issues);
          return true;
        }

        writeJson(response, 200, payload.data);
        return true;
      }

      writeError(response, 404, 'not_found', 'Lobby discovery API route not found.');
      return true;
    },
  };
}
