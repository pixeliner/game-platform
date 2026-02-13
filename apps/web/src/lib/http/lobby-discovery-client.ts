import {
  lobbyDiscoveryQuerySchema,
  lobbyDiscoveryResponseSchema,
  lobbyQuickJoinQuerySchema,
  lobbyQuickJoinResponseSchema,
  type LobbyDiscoveryQuery,
  type LobbyDiscoveryResponse,
  type LobbyQuickJoinQuery,
  type LobbyQuickJoinResponse,
} from '@game-platform/protocol';

import { resolveGatewayHttpUrl } from '@/src/lib/env';

export class LobbyDiscoveryHttpError extends Error {
  public readonly status: number;
  public readonly details: unknown;

  public constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'LobbyDiscoveryHttpError';
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
    safeParse: (input: unknown) =>
      | {
          success: true;
          data: T;
        }
      | {
          success: false;
          error: {
            issues: unknown[];
          };
        };
  },
): Promise<T> {
  const response = await fetch(url, {
    cache: 'no-store',
  });

  const json = await response.json();
  if (!response.ok) {
    throw new LobbyDiscoveryHttpError(response.status, 'Lobby discovery request failed.', json);
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new LobbyDiscoveryHttpError(500, 'Lobby discovery response failed validation.', parsed.error.issues);
  }

  return parsed.data;
}

export type FetchLobbiesInput = Partial<LobbyDiscoveryQuery>;

export async function fetchLobbies(input: FetchLobbiesInput = {}): Promise<LobbyDiscoveryResponse> {
  const query = lobbyDiscoveryQuerySchema.parse({
    limit: input.limit,
    offset: input.offset,
    phase: input.phase,
    gameId: input.gameId,
    access: input.access,
    search: input.search,
    sort: input.sort,
  });

  const url = buildUrl('/api/lobbies', {
    limit: query.limit,
    offset: query.offset,
    phase: query.phase,
    gameId: query.gameId,
    access: query.access,
    search: query.search,
    sort: query.sort,
  });

  return fetchJson(url, lobbyDiscoveryResponseSchema);
}

export type FetchQuickJoinLobbyInput = Partial<LobbyQuickJoinQuery>;

export async function fetchQuickJoinLobby(
  input: FetchQuickJoinLobbyInput = {},
): Promise<LobbyQuickJoinResponse> {
  const query = lobbyQuickJoinQuerySchema.parse({
    gameId: input.gameId,
  });

  const url = buildUrl('/api/lobbies/quick-join', {
    gameId: query.gameId,
  });

  return fetchJson(url, lobbyQuickJoinResponseSchema);
}
