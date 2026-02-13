import type { LobbyState } from './lobby-types.js';

export function computeSelectedGameId(lobby: LobbyState): string | null {
  const hostVote = lobby.votesByPlayerId.get(lobby.hostPlayerId);
  if (hostVote) {
    return hostVote;
  }

  const counts = new Map<string, number>();
  for (const gameId of lobby.votesByPlayerId.values()) {
    const count = counts.get(gameId) ?? 0;
    counts.set(gameId, count + 1);
  }

  let selected: string | null = null;
  let bestCount = 0;
  for (const [gameId, count] of counts.entries()) {
    if (count > bestCount) {
      selected = gameId;
      bestCount = count;
      continue;
    }

    if (count === bestCount && selected !== null && gameId < selected) {
      selected = gameId;
    }
  }

  return selected;
}
