'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ADMIN_TICK_RATE_MAX,
  ADMIN_TICK_RATE_MIN,
  type LobbyStateMessage,
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

export interface AdminControlsPanelProps {
  lobbyState: LobbyStateMessage['payload'];
  onRequestMonitor: () => void;
  onSetTickRate: (tickRate: number) => void;
  onKickPlayer: (targetPlayerId: string, reason?: string) => void;
  onForceStart: () => void;
  onPauseRoom: (roomId: string) => void;
  onResumeRoom: (roomId: string) => void;
  onStopRoom: (roomId: string, reason?: string) => void;
  onForceEndRoom: (roomId: string) => void;
}

export function AdminControlsPanel(props: AdminControlsPanelProps): React.JSX.Element {
  const [tickRateInput, setTickRateInput] = useState(String(props.lobbyState.configuredTickRate));
  const [kickTargetPlayerId, setKickTargetPlayerId] = useState('');
  const [kickReason, setKickReason] = useState('');
  const [stopReason, setStopReason] = useState('');

  const connectedPlayers = useMemo(
    () => props.lobbyState.players.filter((player) => player.isConnected),
    [props.lobbyState.players],
  );

  useEffect(() => {
    setTickRateInput(String(props.lobbyState.configuredTickRate));
  }, [props.lobbyState.configuredTickRate]);

  const roomId = props.lobbyState.activeRoomId;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Admin Controls</CardTitle>
        <CardDescription>Host-only runtime and lobby command surface.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 rounded border border-border/70 bg-background/60 p-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Tick Rate ({ADMIN_TICK_RATE_MIN}-{ADMIN_TICK_RATE_MAX})</span>
            <Input
              value={tickRateInput}
              onChange={(event) => setTickRateInput(event.target.value)}
              inputMode="numeric"
            />
          </label>
          <Button
            size="sm"
            onClick={() => {
              const tickRate = Number.parseInt(tickRateInput, 10);
              if (!Number.isInteger(tickRate)) {
                return;
              }
              if (tickRate < ADMIN_TICK_RATE_MIN || tickRate > ADMIN_TICK_RATE_MAX) {
                return;
              }
              props.onSetTickRate(tickRate);
            }}
          >
            Set Tick Rate
          </Button>
        </div>

        <div className="grid gap-2 rounded border border-border/70 bg-background/60 p-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Kick Player ID</span>
            <Input
              value={kickTargetPlayerId}
              onChange={(event) => setKickTargetPlayerId(event.target.value)}
              placeholder="player_x"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Kick Reason (optional)</span>
            <Input
              value={kickReason}
              onChange={(event) => setKickReason(event.target.value)}
              placeholder="afk"
            />
          </label>
          <div className="sm:col-span-2 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const playerId = kickTargetPlayerId.trim();
                if (!playerId) {
                  return;
                }
                props.onKickPlayer(playerId, kickReason.trim() || undefined);
              }}
            >
              Kick Player
            </Button>
            <span className="text-xs text-muted-foreground self-center">
              Connected: {connectedPlayers.map((player) => player.playerId).join(', ') || 'none'}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={props.onForceStart}>
            Force Start
          </Button>
          <Button size="sm" variant="outline" onClick={props.onRequestMonitor}>
            Refresh Monitor
          </Button>
        </div>

        <div className="grid gap-2 rounded border border-border/70 bg-background/60 p-3 sm:grid-cols-2">
          <div className="text-sm text-muted-foreground">
            Active room: <code>{roomId ?? 'none'}</code>
          </div>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Stop Reason (optional)</span>
            <Input
              value={stopReason}
              onChange={(event) => setStopReason(event.target.value)}
              placeholder="maintenance"
            />
          </label>
          <div className="sm:col-span-2 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!roomId}
              onClick={() => {
                if (!roomId) {
                  return;
                }
                props.onPauseRoom(roomId);
              }}
            >
              Pause Room
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!roomId}
              onClick={() => {
                if (!roomId) {
                  return;
                }
                props.onResumeRoom(roomId);
              }}
            >
              Resume Room
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!roomId}
              onClick={() => {
                if (!roomId) {
                  return;
                }
                props.onStopRoom(roomId, stopReason.trim() || undefined);
              }}
            >
              Stop Room
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={!roomId}
              onClick={() => {
                if (!roomId) {
                  return;
                }
                props.onForceEndRoom(roomId);
              }}
            >
              Force End
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
