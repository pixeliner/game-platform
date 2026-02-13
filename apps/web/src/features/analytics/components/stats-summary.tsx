import Link from 'next/link';
import type { PlayerStatsResponse } from '@game-platform/protocol';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/src/components/ui/card';

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatTimestamp(value: number | null): string {
  if (value === null) {
    return 'Never';
  }

  return new Date(value).toLocaleString();
}

interface MetricProps {
  label: string;
  value: string;
}

function Metric(props: MetricProps): React.JSX.Element {
  return (
    <div className="rounded border border-border/70 bg-background/50 px-3 py-2">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{props.label}</p>
      <p className="text-lg font-semibold">{props.value}</p>
    </div>
  );
}

export interface StatsSummaryProps {
  stats: PlayerStatsResponse;
}

export function StatsSummary(props: StatsSummaryProps): React.JSX.Element {
  const { stats } = props;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>
            Player Stats: {stats.latestNickname ?? stats.guestId}
          </CardTitle>
          <CardDescription>
            Guest ID <code>{stats.guestId}</code>
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Matches" value={String(stats.overall.matchesPlayed)} />
          <Metric label="Wins" value={String(stats.overall.wins)} />
          <Metric label="Win Rate" value={formatPercent(stats.overall.winRate)} />
          <Metric label="Total Score" value={String(stats.overall.totalScore)} />
          <Metric label="Average Rank" value={stats.overall.averageRank.toFixed(2)} />
          <Metric label="Best Rank" value={stats.overall.bestRank?.toString() ?? 'N/A'} />
          <Metric label="Last Played" value={formatTimestamp(stats.overall.lastPlayedAtMs)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>By Game</CardTitle>
        </CardHeader>
        <CardContent>
          {stats.byGame.length === 0 ? (
            <p className="text-sm text-muted-foreground">No game-specific stats yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-2 py-2">Game</th>
                    <th className="px-2 py-2">Matches</th>
                    <th className="px-2 py-2">Wins</th>
                    <th className="px-2 py-2">Win Rate</th>
                    <th className="px-2 py-2">Score</th>
                    <th className="px-2 py-2">Avg Rank</th>
                    <th className="px-2 py-2">Best Rank</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.byGame.map((entry) => (
                    <tr key={entry.gameId} className="border-t border-border/60">
                      <td className="px-2 py-2">{entry.gameId}</td>
                      <td className="px-2 py-2">{entry.matchesPlayed}</td>
                      <td className="px-2 py-2">{entry.wins}</td>
                      <td className="px-2 py-2">{formatPercent(entry.winRate)}</td>
                      <td className="px-2 py-2">{entry.totalScore}</td>
                      <td className="px-2 py-2">{entry.averageRank.toFixed(2)}</td>
                      <td className="px-2 py-2">{entry.bestRank ?? 'N/A'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Matches</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {stats.recentMatches.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent matches yet.</p>
          ) : (
            stats.recentMatches.map((match) => (
              <div
                key={match.matchId}
                className="rounded border border-border/70 bg-background/60 px-3 py-2 text-sm"
              >
                <div className="font-medium">
                  {match.gameId} • rank #{match.playerResult.rank} • score {match.playerResult.score}
                </div>
                <div className="text-xs text-muted-foreground">
                  {new Date(match.endedAtMs).toLocaleString()} • room <code>{match.roomId}</code>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Winner:{' '}
                  {match.winnerGuestId ? (
                    <Link
                      href={`/stats/${encodeURIComponent(match.winnerGuestId)}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {match.winnerGuestId}
                    </Link>
                  ) : (
                    'None'
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
