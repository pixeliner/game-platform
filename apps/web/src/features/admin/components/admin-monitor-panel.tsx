import type { LobbyAdminMonitorStateMessage } from '@game-platform/protocol';

import { Badge } from '@/src/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/src/components/ui/card';

export interface AdminMonitorPanelProps {
  monitor: LobbyAdminMonitorStateMessage['payload'] | null;
}

function formatTimestamp(timestampMs: number): string {
  return new Date(timestampMs).toLocaleTimeString();
}

export function AdminMonitorPanel(props: AdminMonitorPanelProps): React.JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Diagnostics</CardTitle>
        <CardDescription>Live lobby and runtime diagnostics from gateway admin monitor.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!props.monitor ? (
          <p className="text-muted-foreground">No monitor snapshot yet. Run /monitor or click Refresh Monitor.</p>
        ) : (
          <>
            <div className="grid gap-2 rounded border border-border/70 bg-background/60 p-3 sm:grid-cols-2">
              <div>
                <span className="text-muted-foreground">Phase</span>
                <div className="font-medium">{props.monitor.phase}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Configured Tick Rate</span>
                <div className="font-medium">{props.monitor.configuredTickRate} TPS</div>
              </div>
              <div>
                <span className="text-muted-foreground">Connected Players</span>
                <div className="font-medium">
                  {props.monitor.connectedPlayerCount}/{props.monitor.totalPlayerCount}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Captured</span>
                <div className="font-medium">{formatTimestamp(props.monitor.generatedAtMs)}</div>
              </div>
            </div>

            {props.monitor.room ? (
              <div className="grid gap-2 rounded border border-border/70 bg-background/60 p-3 sm:grid-cols-2">
                <div>
                  <span className="text-muted-foreground">Room</span>
                  <div className="font-medium">{props.monitor.room.roomId}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Game</span>
                  <div className="font-medium">{props.monitor.room.gameId}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Runtime</span>
                  <div className="font-medium">
                    <Badge variant={props.monitor.room.runtimeState === 'running' ? 'success' : 'warning'}>
                      {props.monitor.room.runtimeState}
                    </Badge>
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">Tick</span>
                  <div className="font-medium">{props.monitor.room.tick}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Participants</span>
                  <div className="font-medium">
                    {props.monitor.room.connectedParticipantCount}/{props.monitor.room.participantCount}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">Spectators</span>
                  <div className="font-medium">{props.monitor.room.spectatorCount}</div>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground">No active room runtime.</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
