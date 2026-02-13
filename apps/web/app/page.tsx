import { CreateLobbyForm } from '@/src/features/lobby/components/create-lobby-form';
import { JoinLobbyForm } from '@/src/features/lobby/components/join-lobby-form';
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
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <CreateLobbyForm />
        <JoinLobbyForm />
      </section>
    </main>
  );
}
