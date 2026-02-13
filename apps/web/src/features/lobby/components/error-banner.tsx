import type { LobbyErrorMessage } from '@game-platform/protocol';

import { Button } from '@/src/components/ui/button';

export interface ErrorBannerProps {
  error: LobbyErrorMessage['payload'];
  onDismiss: () => void;
}

export function ErrorBanner(props: ErrorBannerProps): React.JSX.Element {
  return (
    <div className="arcade-surface border-destructive/70 bg-destructive/10 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-destructive">{props.error.code}</div>
          <p className="mt-1 text-sm text-foreground">{props.error.message}</p>
          {props.error.lobbyId ? (
            <p className="mt-1 text-xs text-muted-foreground">Lobby: {props.error.lobbyId}</p>
          ) : null}
        </div>
        <Button variant="ghost" size="sm" onClick={props.onDismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}
