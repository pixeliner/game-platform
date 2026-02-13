import Link from 'next/link';
import type { LeaderboardEntry } from '@game-platform/protocol';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/src/components/ui/card';

export interface LeaderboardTableProps {
  items: LeaderboardEntry[];
  offset: number;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatTimestamp(value: number | null): string {
  if (value === null) {
    return 'Never';
  }

  return new Date(value).toLocaleString();
}

export function LeaderboardTable(props: LeaderboardTableProps): React.JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Leaderboard</CardTitle>
      </CardHeader>
      <CardContent>
        {props.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No leaderboard rows for current filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-2 py-2">Rank</th>
                  <th className="px-2 py-2">Guest</th>
                  <th className="px-2 py-2">Matches</th>
                  <th className="px-2 py-2">Wins</th>
                  <th className="px-2 py-2">Win Rate</th>
                  <th className="px-2 py-2">Score</th>
                  <th className="px-2 py-2">Avg Rank</th>
                  <th className="px-2 py-2">Last Played</th>
                </tr>
              </thead>
              <tbody>
                {props.items.map((item, index) => (
                  <tr key={item.guestId} className="border-t border-border/60">
                    <td className="px-2 py-2">#{props.offset + index + 1}</td>
                    <td className="px-2 py-2">
                      <Link
                        href={`/stats/${encodeURIComponent(item.guestId)}`}
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        {item.latestNickname ?? item.guestId}
                      </Link>
                      <div className="text-xs text-muted-foreground">{item.guestId}</div>
                    </td>
                    <td className="px-2 py-2">{item.matchesPlayed}</td>
                    <td className="px-2 py-2">{item.wins}</td>
                    <td className="px-2 py-2">{formatPercent(item.winRate)}</td>
                    <td className="px-2 py-2">{item.totalScore}</td>
                    <td className="px-2 py-2">{item.averageRank.toFixed(2)}</td>
                    <td className="px-2 py-2 text-muted-foreground">{formatTimestamp(item.lastPlayedAtMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
