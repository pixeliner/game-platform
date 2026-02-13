import type { MatchRepository } from '@game-platform/storage';

import type { RoomRecord } from '../room/room-manager.js';

interface PersistableGameResult {
  playerId: string;
  rank: number;
  score?: number;
  alive?: boolean;
  eliminatedAtTick?: number | null;
}

interface PersistCompletedMatchInput {
  room: RoomRecord;
  endedAtMs: number;
  endReason: string;
  results: unknown[];
}

function isPersistableGameResult(value: unknown): value is PersistableGameResult {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as {
    playerId?: unknown;
    rank?: unknown;
    score?: unknown;
    alive?: unknown;
    eliminatedAtTick?: unknown;
  };

  if (typeof candidate.playerId !== 'string' || candidate.playerId.length === 0) {
    return false;
  }

  if (typeof candidate.rank !== 'number' || !Number.isInteger(candidate.rank) || candidate.rank <= 0) {
    return false;
  }

  if (candidate.score !== undefined && (!Number.isInteger(candidate.score) || !Number.isFinite(candidate.score))) {
    return false;
  }

  if (candidate.alive !== undefined && typeof candidate.alive !== 'boolean') {
    return false;
  }

  const eliminatedAtTick = candidate.eliminatedAtTick;
  if (eliminatedAtTick !== undefined && eliminatedAtTick !== null) {
    if (typeof eliminatedAtTick !== 'number') {
      return false;
    }

    if (!Number.isInteger(eliminatedAtTick) || eliminatedAtTick < 0) {
      return false;
    }
  }

  return true;
}

export class MatchPersistenceService {
  private readonly repository: MatchRepository;

  public constructor(repository: MatchRepository) {
    this.repository = repository;
  }

  public persistCompletedMatch(input: PersistCompletedMatchInput): void {
    const participantsByPlayerId = new Map(
      input.room.participants.map((participant) => [participant.playerId, participant]),
    );
    const validResults = input.results.filter(isPersistableGameResult);

    const players = validResults
      .map((result) => {
        const participant = participantsByPlayerId.get(result.playerId);
        if (!participant) {
          return null;
        }

        return {
          playerId: participant.playerId,
          guestId: participant.guestId,
          nickname: participant.nickname,
          rank: result.rank,
          score: result.score ?? 0,
          alive: result.alive ?? false,
          eliminatedAtTick: result.eliminatedAtTick ?? null,
        };
      })
      .filter((player): player is NonNullable<typeof player> => player !== null)
      .sort((a, b) => {
        if (a.rank !== b.rank) {
          return a.rank - b.rank;
        }

        return a.guestId.localeCompare(b.guestId);
      });

    if (players.length === 0) {
      return;
    }

    const winnerResult = players.find((player) => player.rank === 1) ?? null;

    this.repository.recordMatch({
      matchId: input.room.matchId,
      roomId: input.room.roomId,
      lobbyId: input.room.lobbyId,
      gameId: input.room.gameId,
      seed: input.room.seed,
      tickRate: input.room.tickRate,
      startedAtMs: input.room.startedAtMs,
      endedAtMs: input.endedAtMs,
      endReason: input.endReason,
      winnerPlayerId: winnerResult?.playerId ?? null,
      winnerGuestId: winnerResult?.guestId ?? null,
      players,
    });
  }
}
