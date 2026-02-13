import type { BombermanEvent } from '@game-platform/game-bomberman';

import { Badge } from '@/src/components/ui/badge';
import { Button } from '@/src/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/src/components/ui/card';
import type { GameConnectionStatus, GameSessionState } from '@/src/lib/ws/game-session-reducer';

export interface BombermanHudProps {
  state: GameSessionState;
  roomId: string;
  lobbyId: string;
  playerId: string | null;
  gatewayUrl: string;
  gatewayUrlSource: 'env' | 'fallback';
  onReconnectNow: () => void;
  onBackToLobby: () => void;
  onClearError: () => void;
}

function statusVariant(status: GameConnectionStatus): 'success' | 'warning' | 'danger' | 'secondary' {
  switch (status) {
    case 'connected':
      return 'success';
    case 'connecting':
    case 'joining_lobby':
    case 'joining_game':
    case 'reconnecting':
      return 'warning';
    case 'disconnected':
    case 'error':
      return 'danger';
    case 'game_over':
      return 'secondary';
    case 'idle':
      return 'secondary';
  }
}

function formatEvent(event: BombermanEvent): string {
  switch (event.kind) {
    case 'player.moved':
      return `${event.playerId} moved ${event.direction} to (${event.to.x}, ${event.to.y})`;
    case 'bomb.placed':
      return `${event.playerId} placed bomb at (${event.x}, ${event.y})`;
    case 'bomb.exploded':
      return `${event.ownerPlayerId} bomb exploded at (${event.x}, ${event.y})`;
    case 'block.destroyed':
      return `Block destroyed at (${event.x}, ${event.y})`;
    case 'player.eliminated':
      return `${event.playerId} eliminated`;
    case 'round.over':
      return event.winnerPlayerId
        ? `Round over, winner ${event.winnerPlayerId}`
        : 'Round over, no winner';
  }
}

export function BombermanHud(props: BombermanHudProps): React.JSX.Element {
  const players = props.state.latestSnapshot?.players ?? [];
  const recentEvents = props.state.recentEvents.slice(-8).reverse();
  const showReconnect = props.state.connectionStatus === 'disconnected' || props.state.connectionStatus === 'error';

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Session</CardTitle>
          <CardDescription>Authoritative gateway-backed game connection.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">Status</span>
            <Badge variant={statusVariant(props.state.connectionStatus)}>
              {props.state.connectionStatus}
            </Badge>
            {props.state.reconnectAttempt > 0 ? (
              <span className="text-xs text-muted-foreground">attempt #{props.state.reconnectAttempt}</span>
            ) : null}
          </div>

          <div className="space-y-1 text-xs text-muted-foreground">
            <div>
              Gateway ({props.gatewayUrlSource}): <code>{props.gatewayUrl}</code>
            </div>
            <div>
              Room: <code>{props.roomId}</code>
            </div>
            <div>
              Lobby: <code>{props.lobbyId}</code>
            </div>
            <div>
              Player: <code>{props.playerId ?? 'unknown'}</code>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {showReconnect ? (
              <Button variant="outline" size="sm" onClick={props.onReconnectNow}>
                Reconnect
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" onClick={props.onBackToLobby}>
              Back to Lobby
            </Button>
          </div>
        </CardContent>
      </Card>

      {props.state.lastError ? (
        <Card className="border-destructive/70 bg-destructive/10">
          <CardHeader>
            <CardTitle className="text-sm text-destructive">Gateway Error</CardTitle>
            <CardDescription className="text-destructive/90">
              [{props.state.lastError.code}] {props.state.lastError.message}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="ghost" size="sm" onClick={props.onClearError}>
              Dismiss
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Players</CardTitle>
          <CardDescription>Live status from latest snapshot.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {players.length === 0 ? (
            <p className="text-sm text-muted-foreground">Waiting for snapshot...</p>
          ) : (
            players.map((player) => (
              <div
                key={player.playerId}
                className="flex items-center justify-between rounded border border-border/70 bg-background/60 px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-2">
                  <span>{player.playerId}</span>
                  {player.playerId === props.playerId ? (
                    <Badge variant="outline">You</Badge>
                  ) : null}
                </div>
                <Badge variant={player.alive ? 'success' : 'danger'}>
                  {player.alive ? 'Alive' : 'Eliminated'}
                </Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Events</CardTitle>
          <CardDescription>Most recent game events.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {recentEvents.length === 0 ? (
            <p className="text-muted-foreground">No events yet.</p>
          ) : (
            recentEvents.map((record) => (
              <div
                key={`${record.eventId}-${record.tick}`}
                className="rounded border border-border/70 bg-background/50 p-2"
              >
                <div className="text-xs text-muted-foreground">
                  tick {record.tick} • event #{record.eventId}
                </div>
                <div>{formatEvent(record.event)}</div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
