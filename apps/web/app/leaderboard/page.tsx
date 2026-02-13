import Link from 'next/link';

import { Button } from '@/src/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Input } from '@/src/components/ui/input';
import { LeaderboardTable } from '@/src/features/analytics/components/leaderboard-table';
import { PaginationControls } from '@/src/features/analytics/components/pagination-controls';
import { fetchLeaderboard } from '@/src/lib/http/persistence-client';

export const dynamic = 'force-dynamic';

interface LeaderboardPageProps {
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

export default async function LeaderboardPage(
  props: LeaderboardPageProps,
): Promise<React.JSX.Element> {
  const searchParams = await props.searchParams;
  const gameId = firstValue(searchParams.gameId);
  const limit = parseOptionalInteger(firstValue(searchParams.limit));
  const offset = parseOptionalInteger(firstValue(searchParams.offset));

  try {
    const leaderboard = await fetchLeaderboard({
      ...(gameId ? { gameId } : {}),
      ...(limit !== undefined ? { limit } : {}),
      ...(offset !== undefined ? { offset } : {}),
    });

    return (
      <main className="space-y-4">
        <section className="arcade-surface p-4">
          <h1 className="text-2xl font-semibold tracking-tight">Leaderboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ranked by wins, score, and average rank.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/">Home</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/history">History</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/stats/me">My Stats</Link>
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
              <Input name="limit" placeholder="limit" defaultValue={String(leaderboard.page.limit)} />
              <Input name="offset" placeholder="offset" defaultValue={String(leaderboard.page.offset)} />
              <Button type="submit" className="md:col-span-4 md:w-fit">
                Apply
              </Button>
            </form>
          </CardContent>
        </Card>

        <PaginationControls
          basePath="/leaderboard"
          limit={leaderboard.page.limit}
          offset={leaderboard.page.offset}
          total={leaderboard.page.total}
          query={{ gameId }}
        />
        <LeaderboardTable items={leaderboard.items} offset={leaderboard.page.offset} />
      </main>
    );
  } catch (error) {
    return (
      <main>
        <Card className="border-destructive/70 bg-destructive/10">
          <CardHeader>
            <CardTitle className="text-destructive">Leaderboard API Error</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>Unable to load leaderboard from gateway.</p>
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
