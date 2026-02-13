'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Application } from 'pixi.js';
import type { MatchHistoryItem } from '@game-platform/protocol';
import {
  MAP_HEIGHT,
  MAP_WIDTH,
} from '@game-platform/game-bomberman';

import { Badge } from '@/src/components/ui/badge';
import { Button } from '@/src/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/src/components/ui/card';
import { useGameConnection } from '@/src/hooks/use-game-connection';
import {
  PersistenceHttpError,
  fetchMatchByRoom,
} from '@/src/lib/http/persistence-client';
import { KeyboardController } from '@/src/features/bomberman/input/keyboard-controller';
import { createPixiBombermanScene } from '@/src/features/bomberman/pixi/create-pixi-bomberman-scene';
import { BOMBERMAN_TILE_SIZE } from '@/src/features/bomberman/pixi/sprite-atlas';
import { buildMatchOutcomeViewModel } from '@/src/features/bomberman/results/match-outcome-view-model';
import type { GameRouteMode } from '@/src/lib/ws/game-connection-flow';
import { BombermanHud } from './bomberman-hud';

export interface BombermanGameClientProps {
  roomId: string;
  lobbyId: string | null;
  mode: GameRouteMode;
}

const MATCH_FETCH_RETRY_DELAYS_MS = [0, 250, 500, 1000, 2000] as const;

type PersistedMatchStatus = 'idle' | 'loading' | 'loaded' | 'failed';

export function BombermanGameClient(props: BombermanGameClientProps): React.JSX.Element {
  const router = useRouter();
  const stageHostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<Application | null>(null);
  const sceneRef = useRef<Awaited<ReturnType<typeof createPixiBombermanScene>> | null>(null);
  const persistedFetchRunIdRef = useRef(0);

  const [persistedMatchStatus, setPersistedMatchStatus] = useState<PersistedMatchStatus>('idle');
  const [persistedMatch, setPersistedMatch] = useState<MatchHistoryItem | null>(null);
  const [persistedMatchError, setPersistedMatchError] = useState<string | null>(null);

  const lobbyId = props.lobbyId;
  const connection = useGameConnection({
    roomId: props.roomId,
    lobbyId,
    mode: props.mode,
  });
  const effectiveLobbyId = connection.resolvedLobbyId;
  const isSpectatorMode = props.mode === 'spectator';

  const snapshot = connection.state.latestSnapshot;
  const currentPlayer = snapshot?.players.find((player) => player.playerId === connection.playerId) ?? null;
  const stageWidth = (snapshot?.width ?? MAP_WIDTH) * BOMBERMAN_TILE_SIZE;
  const stageHeight = (snapshot?.height ?? MAP_HEIGHT) * BOMBERMAN_TILE_SIZE;
  const gameOver = connection.state.gameOver;

  const persistedOutcome = useMemo(
    () => (persistedMatch ? buildMatchOutcomeViewModel(persistedMatch) : null),
    [persistedMatch],
  );

  useEffect(() => {
    const stageHost = stageHostRef.current;
    if (!stageHost) {
      return;
    }

    let disposed = false;
    let tickerCallback:
      | ((ticker: { deltaMS: number }) => void)
      | null = null;

    const initialize = async (): Promise<void> => {
      const app = new Application();
      await app.init({
        width: stageWidth,
        height: stageHeight,
        antialias: false,
        backgroundColor: 0x101923,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });

      if (disposed) {
        app.destroy(true, true);
        return;
      }

      stageHost.replaceChildren(app.canvas);
      appRef.current = app;

      const scene = await createPixiBombermanScene();
      sceneRef.current = scene;
      app.stage.addChild(scene.root);
      tickerCallback = (ticker) => {
        sceneRef.current?.advance(ticker.deltaMS);
      };
      app.ticker.add(tickerCallback);

      if (snapshot) {
        scene.update(snapshot);
      }
    };

    void initialize();

    return () => {
      disposed = true;

      if (appRef.current && tickerCallback) {
        appRef.current.ticker.remove(tickerCallback);
        tickerCallback = null;
      }

      sceneRef.current?.destroy();
      sceneRef.current = null;

      if (appRef.current) {
        appRef.current.destroy(true, true);
        appRef.current = null;
      }

      stageHost.replaceChildren();
    };
  }, []);

  useEffect(() => {
    if (!appRef.current) {
      return;
    }

    appRef.current.renderer.resize(stageWidth, stageHeight);
  }, [stageHeight, stageWidth]);

  useEffect(() => {
    if (!snapshot) {
      return;
    }

    sceneRef.current?.update(snapshot);
  }, [snapshot]);

  useEffect(() => {
    if (isSpectatorMode) {
      return;
    }

    const controller = new KeyboardController({
      onMoveIntent: connection.sendMoveIntent,
      onBombPlace: connection.placeBomb,
      onRemoteDetonate: connection.remoteDetonateBomb,
      onBombThrow: connection.throwBomb,
    });

    controller.attach(window);

    return () => {
      controller.detach(true);
    };
  }, [
    connection.placeBomb,
    connection.remoteDetonateBomb,
    connection.sendMoveIntent,
    connection.throwBomb,
    isSpectatorMode,
  ]);

  const backToLobby = useCallback(() => {
    connection.leaveGame();
    if (effectiveLobbyId) {
      router.push(`/lobby/${encodeURIComponent(effectiveLobbyId)}`);
      return;
    }

    router.push('/');
  }, [connection.leaveGame, effectiveLobbyId, router]);

  const retryRound = useCallback(() => {
    connection.leaveGame();
    if (effectiveLobbyId) {
      router.push(`/lobby/${encodeURIComponent(effectiveLobbyId)}?rematch=1`);
      return;
    }

    router.push('/');
  }, [connection.leaveGame, effectiveLobbyId, router]);

  const loadPersistedMatch = useCallback(async () => {
    if (!gameOver) {
      return;
    }

    const runId = persistedFetchRunIdRef.current + 1;
    persistedFetchRunIdRef.current = runId;

    setPersistedMatchStatus('loading');
    setPersistedMatch(null);
    setPersistedMatchError(null);

    let lastError: unknown = null;

    for (const delayMs of MATCH_FETCH_RETRY_DELAYS_MS) {
      if (persistedFetchRunIdRef.current !== runId) {
        return;
      }

      if (delayMs > 0) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, delayMs);
        });
      }

      if (persistedFetchRunIdRef.current !== runId) {
        return;
      }

      try {
        const response = await fetchMatchByRoom(gameOver.roomId);
        if (persistedFetchRunIdRef.current !== runId) {
          return;
        }

        setPersistedMatch(response.item);
        setPersistedMatchStatus('loaded');
        setPersistedMatchError(null);
        return;
      } catch (error) {
        lastError = error;
        const retryable = error instanceof PersistenceHttpError && (error.status === 404 || error.status === 500);
        if (!retryable) {
          break;
        }
      }
    }

    if (persistedFetchRunIdRef.current !== runId) {
      return;
    }

    setPersistedMatchStatus('failed');
    if (lastError instanceof PersistenceHttpError) {
      setPersistedMatchError(`Failed to load persisted results (${lastError.status}).`);
    } else if (lastError instanceof Error) {
      setPersistedMatchError(lastError.message);
    } else {
      setPersistedMatchError('Failed to load persisted results.');
    }
  }, [gameOver]);

  useEffect(() => {
    const gameOverKey = gameOver ? `${gameOver.roomId}:${gameOver.endedAtMs}` : null;
    if (!gameOverKey) {
      persistedFetchRunIdRef.current += 1;
      setPersistedMatchStatus('idle');
      setPersistedMatch(null);
      setPersistedMatchError(null);
      return;
    }

    void loadPersistedMatch();
  }, [gameOver, loadPersistedMatch]);

  const retryPersistedLoad = useCallback(() => {
    void loadPersistedMatch();
  }, [loadPersistedMatch]);

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-3">
        <div className="arcade-surface p-3">
          <h1 className="text-xl font-semibold tracking-tight">Bomberman Match</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isSpectatorMode
              ? 'Spectator mode: you are watching an active authoritative match.'
              : (
                <>
                  Use <code>WASD</code> or arrow keys to move. <code>Space</code> places bombs,
                  {' '}
                  <code>E</code> remote-detonates,
                  {' '}
                  <code>Shift+Space</code> throws.
                </>
              )}
          </p>
        </div>

        <div className="bomberman-stage-shell">
          {isSpectatorMode ? (
            <div className="bomberman-loadout-strip">
              <div className="bomberman-loadout-values">
                <span>Spectator session</span>
                <span>
                  Controls disabled:
                  {' '}
                  <strong>read-only view</strong>
                </span>
              </div>
              <div className="bomberman-loadout-badges">
                <Badge variant="secondary">Spectator</Badge>
              </div>
            </div>
          ) : (
            <div className="bomberman-loadout-strip">
              <div className="bomberman-loadout-values">
                <span>
                  Bombs:{' '}
                  <strong>
                    {currentPlayer ? `${currentPlayer.activeBombCount}/${currentPlayer.bombLimit}` : '--'}
                  </strong>
                </span>
                <span>
                  Blast: <strong>{currentPlayer ? currentPlayer.blastRadius : '--'}</strong>
                </span>
                <span>
                  Speed: <strong>{currentPlayer ? currentPlayer.speedTier : '--'}</strong>
                </span>
              </div>
              <div className="bomberman-loadout-badges">
                <Badge variant={currentPlayer?.hasRemoteDetonator ? 'success' : 'outline'}>
                  Remote
                </Badge>
                <Badge variant={currentPlayer?.canKickBombs ? 'success' : 'outline'}>
                  Kick
                </Badge>
                <Badge variant={currentPlayer?.canThrowBombs ? 'success' : 'outline'}>
                  Throw
                </Badge>
              </div>
            </div>
          )}

          <div className="bomberman-legend-strip">
            <span>
              Blocks:
              {' '}
              <strong>brick</strong>
              {' / '}
              <strong>crate</strong>
              {' / '}
              <strong>barrel</strong>
            </span>
            <span>
              Drops:
              {' '}
              <strong>bomb</strong>
              , <strong>blast</strong>
              , <strong>speed</strong>
              , <strong>remote</strong>
              , <strong>kick</strong>
              , <strong>throw</strong>
            </span>
          </div>

          <div className="bomberman-stage-canvas">
            <div
              ref={stageHostRef}
              className="bomberman-stage-host"
              style={{ width: stageWidth, height: stageHeight }}
            />
          </div>
          {!snapshot ? (
            <div className="bomberman-stage-overlay">
              Waiting for first server snapshot...
            </div>
          ) : null}

          {gameOver ? (
            <div className="bomberman-gameover-overlay">
              <Card className="w-full max-w-2xl border-border/80 bg-card/95">
                <CardHeader>
                  <CardTitle>Game Over</CardTitle>
                  <CardDescription>
                    Round finished. Review ranking and elimination timeline or run a quick rematch.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {persistedMatchStatus === 'loading' ? (
                    <p className="text-sm text-muted-foreground">Loading persisted match results…</p>
                  ) : null}

                  {persistedMatchStatus === 'loaded' && persistedOutcome ? (
                    <div className="space-y-3 text-sm">
                      <div className="bomberman-results-table-wrap">
                        <table className="bomberman-results-table">
                          <thead>
                            <tr>
                              <th>Rank</th>
                              <th>Nickname</th>
                              <th>Guest</th>
                              <th>Score</th>
                              <th>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {persistedOutcome.scoreboardRows.map((row) => (
                              <tr key={`${row.playerId}:${row.guestId}`}>
                                <td>#{row.rank}</td>
                                <td>{row.nickname}</td>
                                <td>
                                  <code>{row.guestId}</code>
                                </td>
                                <td>{row.score}</td>
                                <td>{row.alive ? 'Survived' : 'Eliminated'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div>
                        <h3 className="text-sm font-semibold">Elimination Timeline</h3>
                        <ul className="bomberman-timeline-list">
                          {persistedOutcome.timelineRows.map((row) => (
                            <li key={`${row.type}:${row.playerId}:${row.guestId}`}>
                              <span className="bomberman-timeline-name">
                                {row.nickname} <code>({row.guestId})</code>
                              </span>
                              {row.type === 'eliminated' ? (
                                <span className="text-muted-foreground">
                                  eliminated at tick {row.tick} ({row.atSeconds})
                                </span>
                              ) : (
                                <span className="text-muted-foreground">survived to round end</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ) : null}

                  {persistedMatchStatus === 'failed' ? (
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">
                        {persistedMatchError ?? 'Persisted results unavailable. Showing websocket fallback.'}
                      </p>
                      <div className="space-y-2 text-sm">
                        {gameOver.results
                          .slice()
                          .sort((a, b) => {
                            if (a.rank !== b.rank) {
                              return a.rank - b.rank;
                            }

                            return a.playerId.localeCompare(b.playerId);
                          })
                          .map((result) => (
                            <div
                              key={result.playerId}
                              className="flex items-center justify-between rounded border border-border/70 bg-background/60 px-3 py-2"
                            >
                              <span>
                                <code>{result.playerId}</code>
                              </span>
                              <span>
                                rank #{result.rank}
                                {result.score !== undefined ? ` • score ${result.score}` : ''}
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    {!isSpectatorMode ? (
                      <Button size="sm" onClick={retryRound}>
                        Retry
                      </Button>
                    ) : null}
                    <Button size="sm" variant="outline" onClick={backToLobby}>
                      {effectiveLobbyId ? 'Back to Lobby' : 'Back Home'}
                    </Button>
                    {persistedMatchStatus === 'failed' ? (
                      <Button size="sm" variant="ghost" onClick={retryPersistedLoad}>
                        Retry Results Load
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : null}
        </div>
      </div>

      <BombermanHud
        state={connection.state}
        roomId={props.roomId}
        lobbyId={effectiveLobbyId}
        playerId={connection.playerId}
        requestedMode={props.mode}
        gatewayUrl={connection.gatewayUrl}
        gatewayUrlSource={connection.gatewayUrlSource}
        onReconnectNow={connection.reconnectNow}
        onBackToLobby={backToLobby}
        onClearError={connection.clearError}
      />
    </section>
  );
}
