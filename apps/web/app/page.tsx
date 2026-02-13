import Link from 'next/link';

import { Button } from '@/src/components/ui/button';
import { CreateLobbyForm } from '@/src/features/lobby/components/create-lobby-form';
import { JoinLobbyForm } from '@/src/features/lobby/components/join-lobby-form';
import { WatchMatchForm } from '@/src/features/lobby/components/watch-match-form';
import { resolveGatewayWebSocketUrl } from '@/src/lib/env';

export default function HomePage(): React.JSX.Element {
  const gateway = resolveGatewayWebSocketUrl();

  return (
    <main className="space-y-6">
      <section className="arcade-surface arcade-grid-bg p-6">
        <h1 className="text-3xl font-semibold tracking-tight">LAN Lobby Control</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Create or join a room for deterministic Bomberman sessions.
        </p>
        <p className="mt-4 text-xs text-muted-foreground">
          Gateway URL ({gateway.source}): <code>{gateway.value}</code>
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/lobbies">Browse Lobbies</Link>
          </Button>
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
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <CreateLobbyForm />
        <JoinLobbyForm />
        <WatchMatchForm />
      </section>
    </main>
  );
}
