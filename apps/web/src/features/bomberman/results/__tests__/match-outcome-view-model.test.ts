import { describe, expect, it } from 'vitest';
import type { MatchHistoryItem } from '@game-platform/protocol';

import { buildMatchOutcomeViewModel } from '../match-outcome-view-model';

function createMatch(partial?: Partial<MatchHistoryItem>): MatchHistoryItem {
  return {
    matchId: 'match-1',
    roomId: 'room-1',
    lobbyId: 'lobby-1',
    gameId: 'bomberman',
    seed: 1,
    tickRate: 20,
    startedAtMs: 1000,
    endedAtMs: 2000,
    endReason: 'game_over',
    winnerPlayerId: 'player-a',
    winnerGuestId: 'guest-a',
    players: [],
    ...partial,
  };
}

describe('buildMatchOutcomeViewModel', () => {
  it('sorts scoreboard by rank then guestId', () => {
    const viewModel = buildMatchOutcomeViewModel(createMatch({
      players: [
        {
          playerId: 'player-c',
          guestId: 'guest-c',
          nickname: 'Charlie',
          rank: 2,
          score: 1,
          alive: false,
          eliminatedAtTick: 80,
        },
        {
          playerId: 'player-a',
          guestId: 'guest-a',
          nickname: 'Alpha',
          rank: 1,
          score: 4,
          alive: true,
          eliminatedAtTick: null,
        },
        {
          playerId: 'player-b',
          guestId: 'guest-b',
          nickname: 'Bravo',
          rank: 2,
          score: 1,
          alive: false,
          eliminatedAtTick: 70,
        },
      ],
    }));

    expect(viewModel.scoreboardRows.map((row) => `${row.rank}:${row.guestId}`)).toEqual([
      '1:guest-a',
      '2:guest-b',
      '2:guest-c',
    ]);
  });

  it('builds timeline with eliminated players first by elimination tick, then survivors', () => {
    const viewModel = buildMatchOutcomeViewModel(createMatch({
      players: [
        {
          playerId: 'player-a',
          guestId: 'guest-a',
          nickname: 'Alpha',
          rank: 1,
          score: 4,
          alive: true,
          eliminatedAtTick: null,
        },
        {
          playerId: 'player-c',
          guestId: 'guest-c',
          nickname: 'Charlie',
          rank: 3,
          score: 0,
          alive: false,
          eliminatedAtTick: 120,
        },
        {
          playerId: 'player-b',
          guestId: 'guest-b',
          nickname: 'Bravo',
          rank: 2,
          score: 2,
          alive: false,
          eliminatedAtTick: 60,
        },
      ],
    }));

    expect(viewModel.timelineRows.map((row) => `${row.type}:${row.guestId}`)).toEqual([
      'eliminated:guest-b',
      'eliminated:guest-c',
      'survived:guest-a',
    ]);
  });

  it('formats eliminated timeline seconds from tickRate with one decimal', () => {
    const viewModel = buildMatchOutcomeViewModel(createMatch({
      tickRate: 20,
      players: [
        {
          playerId: 'player-b',
          guestId: 'guest-b',
          nickname: 'Bravo',
          rank: 2,
          score: 2,
          alive: false,
          eliminatedAtTick: 45,
        },
      ],
    }));

    const row = viewModel.timelineRows[0];
    expect(row?.type).toBe('eliminated');
    if (row?.type === 'eliminated') {
      expect(row.tick).toBe(45);
      expect(row.atSeconds).toBe('2.3s');
    }
  });
});
