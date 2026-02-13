'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  LobbyDiscoveryAccess,
  LobbyDiscoveryItem,
  LobbyDiscoveryResponse,
  LobbyDiscoverySort,
  LobbyPhase,
} from '@game-platform/protocol';

import { Badge } from '@/src/components/ui/badge';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Input } from '@/src/components/ui/input';
import { fetchLobbies, fetchQuickJoinLobby } from '@/src/lib/http/lobby-discovery-client';
import {
  clearJoinLobbyAccessIntent,
  setJoinLobbyAccessIntent,
} from '@/src/lib/storage/lobby-access-intent-store';
import { ensureLocalProfile, loadLocalProfile } from '@/src/lib/storage/local-profile';

const PAGE_LIMIT = 20;

type PhaseFilter = 'all' | LobbyPhase;
type GameFilter = 'all' | 'bomberman';

function getSelectedGameLabel(selectedGameId: string | null): string {
  if (!selectedGameId) {
    return 'Any';
  }

  if (selectedGameId === 'bomberman') {
    return 'Bomberman';
  }

  return selectedGameId;
}

export function LobbyBrowser(): React.JSX.Element {
  const router = useRouter();
  const initialNickname = useMemo(() => loadLocalProfile()?.nickname ?? 'LanPlayer', []);

  const [nickname, setNickname] = useState(initialNickname);
  const [phase, setPhase] = useState<PhaseFilter>('all');
  const [access, setAccess] = useState<LobbyDiscoveryAccess>('all');
  const [sort, setSort] = useState<LobbyDiscoverySort>('updated_desc');
  const [game, setGame] = useState<GameFilter>('all');
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [refreshToken, setRefreshToken] = useState(0);

  const [response, setResponse] = useState<LobbyDiscoveryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [quickJoinMessage, setQuickJoinMessage] = useState<string | null>(null);
  const [quickJoinLoading, setQuickJoinLoading] = useState(false);
  const [passwordByLobbyId, setPasswordByLobbyId] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;

    const load = async (): Promise<void> => {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const nextResponse = await fetchLobbies({
          limit: PAGE_LIMIT,
          offset,
          phase: phase === 'all' ? undefined : phase,
          gameId: game === 'all' ? undefined : game,
          access,
          search: search.trim().length > 0 ? search.trim() : undefined,
          sort,
        });

        if (cancelled) {
          return;
        }

        setResponse(nextResponse);
      } catch (error) {
        if (cancelled) {
          return;
        }

        setErrorMessage(error instanceof Error ? error.message : 'Failed to load lobbies.');
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [access, game, offset, phase, refreshToken, search, sort]);

  const total = response?.page.total ?? 0;
  const hasPreviousPage = offset > 0;
  const hasNextPage = response ? offset + PAGE_LIMIT < response.page.total : false;

  const joinLobby = (lobby: LobbyDiscoveryItem, password: string | null): void => {
    const profile = ensureLocalProfile(nickname);
    if (password && password.trim().length >= 4) {
      setJoinLobbyAccessIntent(lobby.lobbyId, password.trim());
    } else {
      clearJoinLobbyAccessIntent(lobby.lobbyId);
    }

    const params = new URLSearchParams({
      nickname: profile.nickname,
    });

    router.push(`/lobby/${encodeURIComponent(lobby.lobbyId)}?${params.toString()}`);
  };

  const runQuickJoin = async (): Promise<void> => {
    setQuickJoinLoading(true);
    setQuickJoinMessage(null);

    try {
      const response = await fetchQuickJoinLobby({
        gameId: game === 'all' ? undefined : game,
      });

      if (!response.item) {
        setQuickJoinMessage('No open waiting lobby matches your filters right now.');
        return;
      }

      joinLobby(response.item, null);
    } catch (error) {
      setQuickJoinMessage(error instanceof Error ? error.message : 'Quick join failed.');
    } finally {
      setQuickJoinLoading(false);
    }
  };

  return (
    <section className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Lobby Browser</CardTitle>
          <CardDescription>Discover waiting and active matches on your LAN.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="browser-nickname">
                Nickname
              </label>
              <Input
                id="browser-nickname"
                value={nickname}
                maxLength={32}
                onChange={(event) => setNickname(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="browser-search">
                Search
              </label>
              <Input
                id="browser-search"
                value={search}
                maxLength={64}
                placeholder="Lobby ID or name"
                onChange={(event) => {
                  setOffset(0);
                  setSearch(event.target.value);
                }}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="browser-game">
                Game
              </label>
              <select
                id="browser-game"
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                value={game}
                onChange={(event) => {
                  setOffset(0);
                  setGame(event.target.value as GameFilter);
                }}
              >
                <option value="all">All</option>
                <option value="bomberman">Bomberman</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="browser-phase">
                Phase
              </label>
              <select
                id="browser-phase"
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                value={phase}
                onChange={(event) => {
                  setOffset(0);
                  setPhase(event.target.value as PhaseFilter);
                }}
              >
                <option value="all">All</option>
                <option value="waiting">Waiting</option>
                <option value="starting">Starting</option>
                <option value="in_game">In Game</option>
                <option value="closed">Closed</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="browser-access">
                Access
              </label>
              <select
                id="browser-access"
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                value={access}
                onChange={(event) => {
                  setOffset(0);
                  setAccess(event.target.value as LobbyDiscoveryAccess);
                }}
              >
                <option value="all">All</option>
                <option value="open">Open</option>
                <option value="protected">Protected</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="browser-sort">
                Sort
              </label>
              <select
                id="browser-sort"
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                value={sort}
                onChange={(event) => {
                  setOffset(0);
                  setSort(event.target.value as LobbyDiscoverySort);
                }}
              >
                <option value="updated_desc">Updated (newest)</option>
                <option value="created_desc">Created (newest)</option>
                <option value="connected_desc">Players (most)</option>
                <option value="connected_asc">Players (least)</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => setRefreshToken((value) => value + 1)} disabled={isLoading}>
              Refresh
            </Button>
            <Button type="button" variant="secondary" onClick={runQuickJoin} disabled={quickJoinLoading || isLoading}>
              Quick Join
            </Button>
            {quickJoinMessage ? <p className="text-xs text-muted-foreground">{quickJoinMessage}</p> : null}
          </div>
        </CardContent>
      </Card>

      {errorMessage ? (
        <Card>
          <CardContent className="p-4 text-sm text-destructive">{errorMessage}</CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Available Lobbies</CardTitle>
          <CardDescription>{isLoading ? 'Loading...' : `${total} results`}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {response && response.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No lobbies match the current filters.</p>
          ) : null}

          {response?.items.map((lobby) => {
            const password = passwordByLobbyId[lobby.lobbyId] ?? '';

            return (
              <div key={lobby.lobbyId} className="rounded-md border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold">{lobby.lobbyName}</p>
                    <p className="text-xs text-muted-foreground">{lobby.lobbyId}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="uppercase tracking-wide">
                      {lobby.phase}
                    </Badge>
                    <Badge variant={lobby.requiresPassword ? 'outline' : 'secondary'}>
                      {lobby.requiresPassword ? 'Protected' : 'Open'}
                    </Badge>
                    <Badge variant="outline">{lobby.connectedCount}/{lobby.maxPlayers}</Badge>
                    <Badge variant="secondary">{getSelectedGameLabel(lobby.selectedGameId)}</Badge>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {lobby.phase === 'waiting' ? (
                    lobby.requiresPassword ? (
                      <>
                        <Input
                          type="password"
                          minLength={4}
                          maxLength={64}
                          placeholder="Lobby password"
                          value={password}
                          onChange={(event) => {
                            setPasswordByLobbyId((current) => ({
                              ...current,
                              [lobby.lobbyId]: event.target.value,
                            }));
                          }}
                          className="max-w-52"
                        />
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => joinLobby(lobby, password)}
                          disabled={password.trim().length < 4 || !lobby.isJoinable}
                        >
                          Join Protected
                        </Button>
                      </>
                    ) : (
                      <Button type="button" size="sm" onClick={() => joinLobby(lobby, null)} disabled={!lobby.isJoinable}>
                        Join
                      </Button>
                    )
                  ) : null}

                  {lobby.phase === 'in_game' && lobby.activeRoomId ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (!lobby.activeRoomId) {
                          return;
                        }
                        router.push(`/game/${encodeURIComponent(lobby.activeRoomId)}?mode=spectator`);
                      }}
                    >
                      Watch
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}

          <div className="flex items-center justify-between gap-2 pt-2">
            <p className="text-xs text-muted-foreground">Offset {offset} • Page size {PAGE_LIMIT}</p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!hasPreviousPage}
                onClick={() => setOffset((current) => Math.max(0, current - PAGE_LIMIT))}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!hasNextPage}
                onClick={() => setOffset((current) => current + PAGE_LIMIT)}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
