'use client';

import { useMemo, useState } from 'react';
import type {
  LobbyAdminActionResultMessage,
  LobbyAdminMonitorStateMessage,
  LobbyStateMessage,
} from '@game-platform/protocol';

import { Button } from '@/src/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/src/components/ui/card';
import { Input } from '@/src/components/ui/input';
import {
  parseAdminDebugCommand,
  type ParseAdminDebugCommandResult,
} from '@/src/features/admin/debug-command-parser';
import { AdminControlsPanel } from './admin-controls-panel';
import { AdminMonitorPanel } from './admin-monitor-panel';

export interface AdminDashboardProps {
  lobbyState: LobbyStateMessage['payload'];
  adminMonitor: LobbyAdminMonitorStateMessage['payload'] | null;
  adminActionResults: LobbyAdminActionResultMessage['payload'][];
  onRequestMonitor: () => void;
  onSetTickRate: (tickRate: number) => void;
  onKickPlayer: (targetPlayerId: string, reason?: string) => void;
  onForceStart: () => void;
  onPauseRoom: (roomId: string) => void;
  onResumeRoom: (roomId: string) => void;
  onStopRoom: (roomId: string, reason?: string) => void;
  onForceEndRoom: (roomId: string) => void;
}

function formatTimestamp(timestampMs: number): string {
  return new Date(timestampMs).toLocaleTimeString();
}

export function AdminDashboard(props: AdminDashboardProps): React.JSX.Element {
  const [commandInput, setCommandInput] = useState('/monitor');
  const [commandResult, setCommandResult] = useState<ParseAdminDebugCommandResult | null>(null);

  const actionLog = useMemo(
    () => [...props.adminActionResults].sort((a, b) => b.atMs - a.atMs).slice(0, 12),
    [props.adminActionResults],
  );

  const runCommand = (): void => {
    const parsed = parseAdminDebugCommand(commandInput);
    setCommandResult(parsed);

    if (!parsed.ok) {
      return;
    }

    const roomId = props.lobbyState.activeRoomId;

    switch (parsed.value.kind) {
      case 'monitor.request':
        props.onRequestMonitor();
        return;
      case 'tick_rate.set':
        props.onSetTickRate(parsed.value.tickRate);
        return;
      case 'kick':
        props.onKickPlayer(parsed.value.targetPlayerId, parsed.value.reason);
        return;
      case 'start.force':
        props.onForceStart();
        return;
      case 'room.pause':
        if (!roomId) {
          setCommandResult({ ok: false, error: 'No active room available for /pause.' });
          return;
        }
        props.onPauseRoom(roomId);
        return;
      case 'room.resume':
        if (!roomId) {
          setCommandResult({ ok: false, error: 'No active room available for /resume.' });
          return;
        }
        props.onResumeRoom(roomId);
        return;
      case 'room.stop':
        if (!roomId) {
          setCommandResult({ ok: false, error: 'No active room available for /stop.' });
          return;
        }
        props.onStopRoom(roomId, parsed.value.reason);
        return;
      case 'room.force_end':
        if (!roomId) {
          setCommandResult({ ok: false, error: 'No active room available for /force-end.' });
          return;
        }
        props.onForceEndRoom(roomId);
        return;
    }
  };

  return (
    <div className="space-y-4">
      <AdminControlsPanel
        lobbyState={props.lobbyState}
        onRequestMonitor={props.onRequestMonitor}
        onSetTickRate={props.onSetTickRate}
        onKickPlayer={props.onKickPlayer}
        onForceStart={props.onForceStart}
        onPauseRoom={props.onPauseRoom}
        onResumeRoom={props.onResumeRoom}
        onStopRoom={props.onStopRoom}
        onForceEndRoom={props.onForceEndRoom}
      />

      <Card>
        <CardHeader>
          <CardTitle>Debug Command</CardTitle>
          <CardDescription>
            Commands: <code>/tickrate &lt;10-60&gt;</code>, <code>/kick &lt;playerId&gt; [reason]</code>,
            {' '}
            <code>/force-start</code>, <code>/pause</code>, <code>/resume</code>, <code>/stop [reason]</code>,
            {' '}
            <code>/force-end</code>, <code>/monitor</code>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Input
              value={commandInput}
              onChange={(event) => setCommandInput(event.target.value)}
              className="sm:max-w-lg"
            />
            <Button size="sm" onClick={runCommand}>Run</Button>
          </div>
          {commandResult ? (
            <p className={commandResult.ok ? 'text-xs text-muted-foreground' : 'text-xs text-destructive'}>
              {commandResult.ok ? 'Command parsed and dispatched.' : commandResult.error}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <AdminMonitorPanel monitor={props.adminMonitor} />

      <Card>
        <CardHeader>
          <CardTitle>Recent Actions</CardTitle>
          <CardDescription>Latest host admin action results from gateway.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {actionLog.length === 0 ? (
            <p className="text-muted-foreground">No action results yet.</p>
          ) : (
            actionLog.map((result) => (
              <div key={`${result.action}:${result.atMs}`} className="rounded border border-border/70 bg-background/60 p-2">
                <div className="text-xs text-muted-foreground">
                  {formatTimestamp(result.atMs)} • {result.action}
                </div>
                <div>
                  {result.status.toUpperCase()}
                  {result.message ? ` • ${result.message}` : ''}
                </div>
                {result.roomId ? (
                  <div className="text-xs text-muted-foreground">
                    room <code>{result.roomId}</code>
                  </div>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
