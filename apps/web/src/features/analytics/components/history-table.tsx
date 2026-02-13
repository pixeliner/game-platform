import Link from 'next/link';
import type { MatchHistoryItem } from '@game-platform/protocol';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/src/components/ui/card';

export interface HistoryTableProps {
  items: MatchHistoryItem[];
}

function formatTimestamp(value: number): string {
  return new Date(value).toLocaleString();
}

export function HistoryTable(props: HistoryTableProps): React.JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Match History</CardTitle>
      </CardHeader>
      <CardContent>
        {props.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No matches found for current filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-2 py-2">Ended</th>
                  <th className="px-2 py-2">Game</th>
                  <th className="px-2 py-2">Room</th>
                  <th className="px-2 py-2">Winner</th>
                  <th className="px-2 py-2">Players</th>
                </tr>
              </thead>
              <tbody>
                {props.items.map((item) => (
                  <tr key={item.matchId} className="border-t border-border/60 align-top">
                    <td className="px-2 py-2 text-muted-foreground">{formatTimestamp(item.endedAtMs)}</td>
                    <td className="px-2 py-2">{item.gameId}</td>
                    <td className="px-2 py-2">
                      <code>{item.roomId}</code>
                    </td>
                    <td className="px-2 py-2">
                      {item.winnerGuestId ? (
                        <Link
                          href={`/stats/${encodeURIComponent(item.winnerGuestId)}`}
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          {item.winnerGuestId}
                        </Link>
                      ) : (
                        'No winner'
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <ul className="space-y-1">
                        {item.players.map((player) => (
                          <li key={`${item.matchId}-${player.playerId}`} className="text-xs">
                            #{player.rank} {player.nickname}{' '}
                            <Link
                              href={`/stats/${encodeURIComponent(player.guestId)}`}
                              className="text-primary underline-offset-4 hover:underline"
                            >
                              ({player.guestId})
                            </Link>{' '}
                            score {player.score}
                          </li>
                        ))}
                      </ul>
                    </td>
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
