import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fetchLobbies,
  fetchQuickJoinLobby,
  LobbyDiscoveryHttpError,
} from '../lobby-discovery-client';

describe('lobby-discovery-client', () => {
  const originalHttpUrl = process.env.NEXT_PUBLIC_GATEWAY_HTTP_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_GATEWAY_HTTP_URL = 'http://127.0.0.1:8787';
  });

  afterEach(() => {
    vi.restoreAllMocks();

    if (originalHttpUrl === undefined) {
      delete process.env.NEXT_PUBLIC_GATEWAY_HTTP_URL;
      return;
    }

    process.env.NEXT_PUBLIC_GATEWAY_HTTP_URL = originalHttpUrl;
  });

  it('builds lobby discovery URL with defaults and validates response', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [],
          page: {
            limit: 20,
            offset: 0,
            total: 0,
          },
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        },
      ),
    );

    const response = await fetchLobbies();
    expect(response.page.total).toBe(0);

    const [calledUrl, calledOptions] = fetchSpy.mock.calls[0] ?? [];
    expect(String(calledUrl)).toContain('/api/lobbies?');
    expect(String(calledUrl)).toContain('limit=20');
    expect(String(calledUrl)).toContain('offset=0');
    expect(String(calledUrl)).toContain('access=all');
    expect(String(calledUrl)).toContain('sort=updated_desc');
    expect(calledOptions).toEqual({ cache: 'no-store' });
  });

  it('builds quick-join URL and validates nullable response', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          item: null,
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        },
      ),
    );

    const response = await fetchQuickJoinLobby({ gameId: 'bomberman' });
    expect(response.item).toBeNull();

    const [calledUrl] = fetchSpy.mock.calls[0] ?? [];
    expect(String(calledUrl)).toBe('http://127.0.0.1:8787/api/lobbies/quick-join?gameId=bomberman');
  });

  it('throws typed error for invalid discovery payloads', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            {
              lobbyId: 'lobby-1',
            },
          ],
          page: {
            limit: 20,
            offset: 0,
            total: 1,
          },
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        },
      ),
    );

    await expect(fetchLobbies()).rejects.toBeInstanceOf(LobbyDiscoveryHttpError);
  });
});
