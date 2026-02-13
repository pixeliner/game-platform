'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import type { LobbyStateMessage } from '@game-platform/protocol';

import { ChatPanel } from '@/src/features/lobby/components/chat-panel';
import { ConnectionBanner } from '@/src/features/lobby/components/connection-banner';
import { ErrorBanner } from '@/src/features/lobby/components/error-banner';
import { LobbyHeader } from '@/src/features/lobby/components/lobby-header';
import { PlayerListPanel } from '@/src/features/lobby/components/player-list-panel';
import { ReadyPanel } from '@/src/features/lobby/components/ready-panel';
import { StartPanel } from '@/src/features/lobby/components/start-panel';
import { VotePanel } from '@/src/features/lobby/components/vote-panel';
import { Button } from '@/src/components/ui/button';
import { GAME_CATALOG } from '@/src/lib/game-catalog';
import { useLobbyConnection } from '@/src/hooks/use-lobby-connection';

function getStartDisabledReason(
  lobbyState: LobbyStateMessage['payload'] | null,
  currentPlayerId: string | null,
): string | null {
  if (!lobbyState || !currentPlayerId) {
    return 'Waiting for lobby state.';
  }

  const player = lobbyState.players.find((candidate) => candidate.playerId === currentPlayerId);
  if (!player) {
    return 'Current player not found in lobby.';
  }

  if (!player.isHost) {
    return 'Only host can start the match.';
  }

  if (lobbyState.phase !== 'waiting') {
    return `Cannot start while phase is ${lobbyState.phase}.`;
  }

  if (!lobbyState.selectedGameId) {
    return 'Select a game before starting.';
  }

  const connectedPlayers = lobbyState.players.filter((candidate) => candidate.isConnected);
  if (connectedPlayers.length < 2) {
    return 'Need at least two connected players.';
  }

  const unready = connectedPlayers.filter((candidate) => !candidate.isReady);
  if (unready.length > 0) {
    return 'All connected players must be ready.';
  }

  return null;
}

export default function LobbyPage(): React.JSX.Element {
  const params = useParams<{ lobbyId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const routeLobbyId = typeof params.lobbyId === 'string' ? params.lobbyId : '';

  const nicknameHint = searchParams.get('nickname') ?? undefined;
  const createLobbyName = searchParams.get('lobbyName') ?? undefined;

  const connection = useLobbyConnection({
    routeLobbyId,
    nicknameHint,
    createLobbyName,
    onLobbyResolved: (lobbyId) => {
      router.replace(`/lobby/${encodeURIComponent(lobbyId)}`);
    },
    onStartAccepted: (payload) => {
      router.push(`/game/${encodeURIComponent(payload.roomId)}?lobbyId=${encodeURIComponent(payload.lobbyId)}`);
    },
  });

  const lobbyState = connection.state.lobbyState;
  const currentPlayer = useMemo(() => {
    if (!lobbyState || !connection.currentPlayerId) {
      return null;
    }

    return lobbyState.players.find((player) => player.playerId === connection.currentPlayerId) ?? null;
  }, [connection.currentPlayerId, lobbyState]);

  const startDisabledReason = getStartDisabledReason(lobbyState, connection.currentPlayerId);

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
          <Link href="/history">History</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/leaderboard">Leaderboard</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/stats/me">My Stats</Link>
        </Button>
      </div>

      {lobbyState ? (
        <>
          <LobbyHeader
            lobbyId={lobbyState.lobbyId}
            phase={lobbyState.phase}
            selectedGameId={lobbyState.selectedGameId}
            playerCount={lobbyState.players.length}
            connectedCount={lobbyState.players.filter((player) => player.isConnected).length}
            currentNickname={connection.currentNickname}
          />

          <section className="grid gap-4 lg:grid-cols-[1.05fr_1fr]">
            <div className="space-y-4">
              <PlayerListPanel
                players={lobbyState.players}
                currentPlayerId={connection.currentPlayerId}
              />
              <VotePanel
                games={GAME_CATALOG}
                selectedGameId={lobbyState.selectedGameId}
                votesByPlayerId={lobbyState.votesByPlayerId}
                currentPlayerId={connection.currentPlayerId}
                onVote={connection.castVote}
              />
              <ChatPanel messages={connection.state.chatMessages} onSend={connection.sendChat} />
            </div>

            <div className="space-y-4">
              <ReadyPanel
                isReady={currentPlayer?.isReady ?? false}
                canToggle={connection.currentPlayerId !== null}
                onToggle={connection.setReady}
              />
              <StartPanel
                canStart={startDisabledReason === null}
                disabledReason={startDisabledReason}
                onStart={connection.requestStart}
              />
              <div className="arcade-surface p-4">
                <Button variant="ghost" className="w-full" onClick={connection.leaveLobby}>
                  Leave Lobby
                </Button>
              </div>
            </div>
          </section>
        </>
      ) : (
        <section className="arcade-surface p-6 text-sm text-muted-foreground">
          Waiting for lobby state from gateway...
        </section>
      )}
    </main>
  );
}
