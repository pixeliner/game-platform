import type { LobbyStateMessage } from '@game-platform/protocol';

import { Badge } from '@/src/components/ui/badge';
import { Button } from '@/src/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/src/components/ui/card';
import type { GameCatalogEntry } from '@/src/lib/game-catalog';

export interface VotePanelProps {
  games: ReadonlyArray<GameCatalogEntry>;
  selectedGameId: string | null;
  votesByPlayerId: LobbyStateMessage['payload']['votesByPlayerId'];
  currentPlayerId: string | null;
  onVote: (gameId: string) => void;
}

export function VotePanel(props: VotePanelProps): React.JSX.Element {
  const currentVote =
    props.currentPlayerId === null
      ? null
      : props.votesByPlayerId[props.currentPlayerId] ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Game Vote</CardTitle>
        <CardDescription>Select what this lobby should launch.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-xs text-muted-foreground">
          Selected: {props.selectedGameId ?? 'none'}
          {currentVote ? ` • your vote: ${currentVote}` : ''}
        </div>

        {props.games.map((game) => {
          const isSelected = props.selectedGameId === game.gameId;
          const isVoted = currentVote === game.gameId;

          return (
            <div
              key={game.gameId}
              className="flex items-center justify-between rounded-md border border-border/70 bg-background/60 p-3"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{game.label}</span>
                  {isSelected ? <Badge variant="secondary">Selected</Badge> : null}
                  {isVoted ? <Badge variant="success">Your vote</Badge> : null}
                </div>
                <p className="text-xs text-muted-foreground">{game.description}</p>
              </div>
              <Button
                variant={isVoted ? 'secondary' : 'outline'}
                onClick={() => props.onVote(game.gameId)}
                disabled={props.currentPlayerId === null}
              >
                Vote
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
