import type { MatchHistoryItem, MatchPlayerResult } from '@game-platform/protocol';

export interface MatchScoreboardRow {
  playerId: string;
  guestId: string;
  nickname: string;
  rank: number;
  score: number;
  alive: boolean;
  eliminatedAtTick: number | null;
}

export interface MatchTimelineRowEliminated {
  type: 'eliminated';
  playerId: string;
  guestId: string;
  nickname: string;
  tick: number;
  atSeconds: string;
}

export interface MatchTimelineRowSurvived {
  type: 'survived';
  playerId: string;
  guestId: string;
  nickname: string;
}

export type MatchTimelineRow = MatchTimelineRowEliminated | MatchTimelineRowSurvived;

export interface MatchOutcomeViewModel {
  scoreboardRows: MatchScoreboardRow[];
  timelineRows: MatchTimelineRow[];
}

function compareScoreboardPlayers(a: MatchPlayerResult, b: MatchPlayerResult): number {
  if (a.rank !== b.rank) {
    return a.rank - b.rank;
  }

  return a.guestId.localeCompare(b.guestId);
}

function compareEliminatedPlayers(a: MatchPlayerResult, b: MatchPlayerResult): number {
  const aTick = a.eliminatedAtTick ?? Number.MAX_SAFE_INTEGER;
  const bTick = b.eliminatedAtTick ?? Number.MAX_SAFE_INTEGER;

  if (aTick !== bTick) {
    return aTick - bTick;
  }

  return a.guestId.localeCompare(b.guestId);
}

function formatTickAsSeconds(tick: number, tickRate: number): string {
  return `${(tick / tickRate).toFixed(1)}s`;
}

export function buildMatchOutcomeViewModel(match: MatchHistoryItem): MatchOutcomeViewModel {
  const scoreboardRows = [...match.players]
    .sort(compareScoreboardPlayers)
    .map((player) => ({
      playerId: player.playerId,
      guestId: player.guestId,
      nickname: player.nickname,
      rank: player.rank,
      score: player.score,
      alive: player.alive,
      eliminatedAtTick: player.eliminatedAtTick,
    }));

  const eliminated = [...match.players]
    .filter((player) => !player.alive && player.eliminatedAtTick !== null)
    .sort(compareEliminatedPlayers)
    .map((player) => ({
      type: 'eliminated' as const,
      playerId: player.playerId,
      guestId: player.guestId,
      nickname: player.nickname,
      tick: player.eliminatedAtTick ?? 0,
      atSeconds: formatTickAsSeconds(player.eliminatedAtTick ?? 0, match.tickRate),
    }));

  const survivors = [...match.players]
    .filter((player) => player.alive || player.eliminatedAtTick === null)
    .sort((a, b) => a.guestId.localeCompare(b.guestId))
    .map((player) => ({
      type: 'survived' as const,
      playerId: player.playerId,
      guestId: player.guestId,
      nickname: player.nickname,
    }));

  return {
    scoreboardRows,
    timelineRows: [...eliminated, ...survivors],
  };
}
