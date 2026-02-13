import type { LobbyStateMessage } from '@game-platform/protocol';

import { Badge } from '@/src/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/src/components/ui/card';

export interface PlayerListPanelProps {
  players: LobbyStateMessage['payload']['players'];
  currentPlayerId: string | null;
}

export function PlayerListPanel(props: PlayerListPanelProps): React.JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Players</CardTitle>
        <CardDescription>{props.players.length} members in this lobby.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {props.players.map((player) => {
          const isCurrent = props.currentPlayerId === player.playerId;

          return (
            <div
              key={player.playerId}
              className="flex items-center justify-between rounded-md border border-border/70 bg-background/60 px-3 py-2"
            >
              <div>
                <div className="text-sm font-medium">
                  {player.nickname}
                  {isCurrent ? <span className="ml-1 text-xs text-muted-foreground">(you)</span> : null}
                </div>
                <div className="text-xs text-muted-foreground">{player.playerId}</div>
              </div>
              <div className="flex items-center gap-2">
                {player.isHost ? <Badge variant="secondary">Host</Badge> : null}
                <Badge variant={player.isConnected ? 'success' : 'danger'}>
                  {player.isConnected ? 'Connected' : 'Offline'}
                </Badge>
                <Badge variant={player.isReady ? 'success' : 'outline'}>
                  {player.isReady ? 'Ready' : 'Not ready'}
                </Badge>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
