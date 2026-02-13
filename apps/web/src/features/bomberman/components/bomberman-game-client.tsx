'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Application } from 'pixi.js';
import {
  MAP_HEIGHT,
  MAP_WIDTH,
} from '@game-platform/game-bomberman';

import { Button } from '@/src/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/src/components/ui/card';
import { useGameConnection } from '@/src/hooks/use-game-connection';
import { KeyboardController } from '@/src/features/bomberman/input/keyboard-controller';
import { createPixiBombermanScene } from '@/src/features/bomberman/pixi/create-pixi-bomberman-scene';
import { BOMBERMAN_TILE_SIZE } from '@/src/features/bomberman/pixi/sprite-atlas';
import { BombermanHud } from './bomberman-hud';

export interface BombermanGameClientProps {
  roomId: string;
  lobbyId: string | null;
}

export function BombermanGameClient(props: BombermanGameClientProps): React.JSX.Element {
  const router = useRouter();
  const stageHostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<Application | null>(null);
  const sceneRef = useRef<Awaited<ReturnType<typeof createPixiBombermanScene>> | null>(null);

  const lobbyId = props.lobbyId;
  const connection = useGameConnection({
    roomId: props.roomId,
    lobbyId,
  });

  const snapshot = connection.state.latestSnapshot;
  const stageWidth = (snapshot?.width ?? MAP_WIDTH) * BOMBERMAN_TILE_SIZE;
  const stageHeight = (snapshot?.height ?? MAP_HEIGHT) * BOMBERMAN_TILE_SIZE;

  useEffect(() => {
    const stageHost = stageHostRef.current;
    if (!stageHost) {
      return;
    }

    let disposed = false;

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

      if (snapshot) {
        scene.update(snapshot);
      }
    };

    void initialize();

    return () => {
      disposed = true;
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
    const controller = new KeyboardController({
      onMoveIntent: connection.sendMoveIntent,
      onBombPlace: connection.placeBomb,
    });

    controller.attach(window);

    return () => {
      controller.detach(true);
    };
  }, [connection.placeBomb, connection.sendMoveIntent]);

  const backToLobby = useCallback(() => {
    connection.leaveGame();
    if (lobbyId) {
      router.push(`/lobby/${encodeURIComponent(lobbyId)}`);
      return;
    }

    router.push('/');
  }, [connection.leaveGame, lobbyId, router]);

  if (!lobbyId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Missing Lobby Context</CardTitle>
          <CardDescription>
            This game route requires a <code>lobbyId</code> query parameter to reconnect and rejoin.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => router.push('/')}>Back Home</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-3">
        <div className="arcade-surface p-3">
          <h1 className="text-xl font-semibold tracking-tight">Bomberman Match</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Use <code>WASD</code> or arrow keys to move. Press <code>Space</code> to place bombs.
          </p>
        </div>

        <div className="bomberman-stage-shell">
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
        </div>

        {connection.state.gameOver ? (
          <Card>
            <CardHeader>
              <CardTitle>Round Complete</CardTitle>
              <CardDescription>Server reported game over for this room.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {connection.state.gameOver.results.map((result) => (
                <div
                  key={result.playerId}
                  className="flex items-center justify-between rounded border border-border/70 bg-background/60 px-3 py-2"
                >
                  <span>{result.playerId}</span>
                  <span>
                    rank #{result.rank}
                    {result.score !== undefined ? ` • score ${result.score}` : ''}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </div>

      <BombermanHud
        state={connection.state}
        roomId={props.roomId}
        lobbyId={lobbyId}
        playerId={connection.playerId}
        gatewayUrl={connection.gatewayUrl}
        gatewayUrlSource={connection.gatewayUrlSource}
        onReconnectNow={connection.reconnectNow}
        onBackToLobby={backToLobby}
        onClearError={connection.clearError}
      />
    </section>
  );
}
