import Link from 'next/link';

import { Button } from '@/src/components/ui/button';
import { LobbyBrowser } from '@/src/features/lobby/components/lobby-browser';

export default function LobbyBrowserPage(): React.JSX.Element {
  return (
    <main className="space-y-4">
      <section className="arcade-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Browse Lobbies</h1>
            <p className="text-sm text-muted-foreground">
              Discover open and protected LAN lobbies, filter by phase, and quick-join open sessions.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/">Back Home</Link>
          </Button>
        </div>
      </section>

      <LobbyBrowser />
    </main>
  );
}
