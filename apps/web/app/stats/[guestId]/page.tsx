import Link from 'next/link';

import { Button } from '@/src/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Input } from '@/src/components/ui/input';
import { PaginationControls } from '@/src/features/analytics/components/pagination-controls';
import { StatsSummary } from '@/src/features/analytics/components/stats-summary';
import { fetchPlayerStats } from '@/src/lib/http/persistence-client';

export const dynamic = 'force-dynamic';

interface StatsPageProps {
  params: Promise<{
    guestId: string;
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstValue(input: string | string[] | undefined): string | undefined {
  if (Array.isArray(input)) {
    return input[0];
  }

  return input;
}

function parseOptionalInteger(raw: string | undefined): number | undefined {
  if (!raw) {
    return undefined;
  }

  return Number.parseInt(raw, 10);
}

export default async function StatsGuestPage(props: StatsPageProps): Promise<React.JSX.Element> {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const gameId = firstValue(searchParams.gameId);
  const historyLimit = parseOptionalInteger(firstValue(searchParams.historyLimit));
  const historyOffset = parseOptionalInteger(firstValue(searchParams.historyOffset));

  try {
    const stats = await fetchPlayerStats(params.guestId, {
      ...(gameId ? { gameId } : {}),
      ...(historyLimit !== undefined ? { historyLimit } : {}),
      ...(historyOffset !== undefined ? { historyOffset } : {}),
    });

    return (
      <main className="space-y-4">
        <section className="arcade-surface p-4">
          <h1 className="text-2xl font-semibold tracking-tight">Player Profile</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Historical stats and recent matches.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/">Home</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/history">History</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/leaderboard">Leaderboard</Link>
            </Button>
          </div>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <form method="GET" className="grid gap-3 md:grid-cols-4">
              <Input name="gameId" placeholder="gameId" defaultValue={gameId ?? ''} />
              <Input
                name="historyLimit"
                placeholder="historyLimit"
                defaultValue={String(stats.page.limit)}
              />
              <Input
                name="historyOffset"
                placeholder="historyOffset"
                defaultValue={String(stats.page.offset)}
              />
              <Button type="submit" className="md:col-span-4 md:w-fit">
                Apply
              </Button>
            </form>
          </CardContent>
        </Card>

        <PaginationControls
          basePath={`/stats/${encodeURIComponent(params.guestId)}`}
          limit={stats.page.limit}
          offset={stats.page.offset}
          total={stats.page.total}
          query={{ gameId }}
          limitParamName="historyLimit"
          offsetParamName="historyOffset"
        />

        <StatsSummary stats={stats} />
      </main>
    );
  } catch (error) {
    return (
      <main>
        <Card className="border-destructive/70 bg-destructive/10">
          <CardHeader>
            <CardTitle className="text-destructive">Stats API Error</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>Unable to load player stats from gateway.</p>
            <pre className="overflow-auto rounded bg-background/60 p-2 text-xs">
              {String(error)}
            </pre>
            <Button asChild variant="outline" size="sm">
              <Link href="/">Back Home</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }
}
