import { Badge } from '@/src/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/src/components/ui/card';
import { findGameCatalogEntry } from '@/src/lib/game-catalog';

export interface LobbyHeaderProps {
  lobbyId: string;
  lobbyName: string;
  phase: string;
  activeRoomId: string | null;
  selectedGameId: string | null;
  requiresPassword: boolean;
  maxPlayers: number;
  playerCount: number;
  connectedCount: number;
  currentNickname: string | null;
}

export function LobbyHeader(props: LobbyHeaderProps): React.JSX.Element {
  const selectedGameLabel = props.selectedGameId
    ? (findGameCatalogEntry(props.selectedGameId)?.label ?? props.selectedGameId)
    : 'Unselected';

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-xl">{props.lobbyName}</CardTitle>
          <Badge variant="outline" className="uppercase tracking-wide">
            {props.phase}
          </Badge>
        </div>
        <CardDescription>
          Lobby ID {props.lobbyId} • Connected {props.connectedCount}/{props.playerCount} players
          {' • '}
          Capacity {props.playerCount}/{props.maxPlayers}
          {props.currentNickname ? ` • You are ${props.currentNickname}` : ''}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Selected game</span>
        <Badge variant="secondary">{selectedGameLabel}</Badge>
        {props.requiresPassword ? (
          <>
            <span className="text-muted-foreground">Access</span>
            <Badge variant="outline">Protected</Badge>
          </>
        ) : (
          <>
            <span className="text-muted-foreground">Access</span>
            <Badge variant="outline">Open</Badge>
          </>
        )}
        {props.phase === 'in_game' && props.activeRoomId ? (
          <>
            <span className="text-muted-foreground">Active room</span>
            <Badge variant="outline">{props.activeRoomId}</Badge>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
