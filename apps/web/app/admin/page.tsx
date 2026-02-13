'use client';

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

import { Button } from '@/src/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/src/components/ui/card';
import { AdminDashboard } from '@/src/features/admin/components/admin-dashboard';
import { ConnectionBanner } from '@/src/features/lobby/components/connection-banner';
import { ErrorBanner } from '@/src/features/lobby/components/error-banner';
import { useLobbyConnection } from '@/src/hooks/use-lobby-connection';

const MONITOR_POLL_INTERVAL_MS = 1_000;

interface AdminLobbyConsoleProps {
  lobbyId: string;
}

function AdminLobbyConsole(props: AdminLobbyConsoleProps): React.JSX.Element {
  const router = useRouter();

  const connection = useLobbyConnection({
    routeLobbyId: props.lobbyId,
    onLobbyResolved: (resolvedLobbyId) => {
      router.replace(`/admin?lobbyId=${encodeURIComponent(resolvedLobbyId)}`);
    },
  });

  const lobbyState = connection.state.lobbyState;
  const currentPlayer = useMemo(() => {
    if (!lobbyState || !connection.currentPlayerId) {
      return null;
    }

    return lobbyState.players.find((player) => player.playerId === connection.currentPlayerId) ?? null;
  }, [connection.currentPlayerId, lobbyState]);

  const isHost = currentPlayer?.isHost ?? false;

  useEffect(() => {
    if (!lobbyState || !isHost) {
      return;
    }

    if (connection.state.connectionStatus !== 'connected') {
      return;
    }

    connection.requestAdminMonitor();
    const interval = setInterval(() => {
      connection.requestAdminMonitor();
    }, MONITOR_POLL_INTERVAL_MS);

    return () => {
      clearInterval(interval);
    };
  }, [
    connection.requestAdminMonitor,
    connection.state.connectionStatus,
    isHost,
    lobbyState?.lobbyId,
  ]);

  return (
    <main className="space-y-4">
      <ConnectionBanner
        status={connection.state.connectionStatus}
        reconnectAttempt={connection.state.reconnectAttempt}
        gatewayUrl={connection.gatewayUrl}
        gatewayUrlSource={connection.gatewayUrlSource}
        onReconnectNow={connection.reconnectNow}
      />

      {connection.state.lastError ? (
        <ErrorBanner error={connection.state.lastError} onDismiss={connection.clearError} />
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href={`/lobby/${encodeURIComponent(props.lobbyId)}`}>Back to Lobby</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/">Home</Link>
        </Button>
      </div>

      {!lobbyState ? (
        <Card>
          <CardHeader>
            <CardTitle>Admin Console</CardTitle>
            <CardDescription>Connecting to lobby and awaiting state snapshot.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Waiting for lobby state...</p>
          </CardContent>
        </Card>
      ) : null}

      {lobbyState && !isHost ? (
        <Card className="border-destructive/70 bg-destructive/10">
          <CardHeader>
            <CardTitle className="text-destructive">Host Access Required</CardTitle>
            <CardDescription className="text-destructive/90">
              Admin controls are host-only for this lobby.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild size="sm" variant="outline">
              <Link href={`/lobby/${encodeURIComponent(props.lobbyId)}`}>Return to Lobby</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {lobbyState && isHost ? (
        <AdminDashboard
          lobbyState={lobbyState}
          adminMonitor={connection.state.adminMonitor}
          adminActionResults={connection.state.adminActionResults}
          onRequestMonitor={connection.requestAdminMonitor}
          onSetTickRate={connection.setAdminTickRate}
          onKickPlayer={connection.adminKickPlayer}
          onForceStart={connection.adminForceStart}
          onPauseRoom={connection.adminPauseRoom}
          onResumeRoom={connection.adminResumeRoom}
          onStopRoom={connection.adminStopRoom}
          onForceEndRoom={connection.adminForceEndRoom}
        />
      ) : null}
    </main>
  );
}

export default function AdminPage(): React.JSX.Element {
  const searchParams = useSearchParams();
  const lobbyId = searchParams.get('lobbyId');

  if (!lobbyId) {
    return (
      <main className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Admin Console</CardTitle>
            <CardDescription>This page requires a lobby scope.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">Open this page with <code>?lobbyId=&lt;id&gt;</code>.</p>
            <Button asChild size="sm">
              <Link href="/lobbies">Browse Lobbies</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return <AdminLobbyConsole lobbyId={lobbyId} />;
}
