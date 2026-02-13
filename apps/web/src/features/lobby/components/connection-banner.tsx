import { Button } from '@/src/components/ui/button';
import { Badge } from '@/src/components/ui/badge';
import { cn } from '@/src/lib/utils';
import type { LobbyConnectionStatus } from '@/src/lib/ws/lobby-session-reducer';

export interface ConnectionBannerProps {
  status: LobbyConnectionStatus;
  reconnectAttempt: number;
  gatewayUrl: string;
  gatewayUrlSource: 'env' | 'fallback';
  onReconnectNow: () => void;
}

function statusVariant(status: LobbyConnectionStatus): 'success' | 'warning' | 'danger' | 'secondary' {
  switch (status) {
    case 'connected':
      return 'success';
    case 'reconnecting':
    case 'connecting':
      return 'warning';
    case 'disconnected':
    case 'error':
      return 'danger';
    case 'idle':
      return 'secondary';
  }
}

export function ConnectionBanner(props: ConnectionBannerProps): React.JSX.Element {
  const showReconnectButton = props.status === 'disconnected' || props.status === 'error';

  return (
    <div
      className={cn(
        'arcade-surface arcade-grid-bg flex flex-wrap items-center justify-between gap-3 p-4 text-sm',
      )}
    >
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Gateway</span>
          <code className="rounded bg-muted px-2 py-0.5 text-xs">{props.gatewayUrl}</code>
          <Badge variant="outline">{props.gatewayUrlSource}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Connection</span>
          <Badge variant={statusVariant(props.status)}>{props.status}</Badge>
          {props.reconnectAttempt > 0 ? (
            <span className="text-xs text-muted-foreground">attempt #{props.reconnectAttempt}</span>
          ) : null}
        </div>
      </div>
      {showReconnectButton ? (
        <Button variant="outline" onClick={props.onReconnectNow}>
          Reconnect
        </Button>
      ) : null}
    </div>
  );
}
