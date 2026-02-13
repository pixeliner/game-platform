import { describe, expect, it } from 'vitest';

import { MAX_MATCH_TICKS } from '../constants.js';
import { bombermanModule } from '../module.js';
import { createBombermanSimulationState } from '../state/setup-world.js';
import { runEliminationSystem } from '../systems/elimination-system.js';

describe('bomberman game over and results', () => {
  it('ends the round when only one alive player remains', () => {
    const state = createBombermanSimulationState(
      {
        playerIds: ['p1', 'p2'],
      },
      1,
    );

    const p2EntityId = state.playerEntityIdsByPlayerId.get('p2');
    if (!p2EntityId) {
      throw new Error('missing p2 entity');
    }

    const p2 = state.world.getComponent(p2EntityId, 'player');
    if (!p2) {
      throw new Error('missing p2 component');
    }

    p2.alive = false;
    p2.eliminatedAtTick = 5;

    state.tick = 6;
    runEliminationSystem(state);

    expect(state.phase).toBe('finished');
    expect(state.winnerPlayerId).toBe('p1');

    const roundOverEvent = state.events.find((envelope) => envelope.event.kind === 'round.over');
    expect(roundOverEvent?.event.kind).toBe('round.over');
    if (roundOverEvent?.event.kind === 'round.over') {
      expect(roundOverEvent.event.reason).toBe('last_player_standing');
    }
  });

  it('ends on tick limit and returns deterministic ranked results', () => {
    const game = bombermanModule.createGame(
      {
        playerIds: ['alpha', 'beta'],
      },
      9,
    );

    for (let tick = 0; tick < MAX_MATCH_TICKS; tick += 1) {
      game.tick();
      if (game.isGameOver()) {
        break;
      }
    }

    expect(game.isGameOver()).toBe(true);

    const roundOverEvent = game
      .getEventsSince(0)
      .find((envelope) => envelope.event.kind === 'round.over');

    expect(roundOverEvent?.event.kind).toBe('round.over');
    if (roundOverEvent?.event.kind === 'round.over') {
      expect(roundOverEvent.event.reason).toBe('tick_limit');
      expect(roundOverEvent.event.winnerPlayerId).toBeNull();
    }

    const results = game.getResults();
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      playerId: 'alpha',
      rank: 1,
      score: 1,
    });
    expect(results[1]).toMatchObject({
      playerId: 'beta',
      rank: 2,
      score: 0,
    });
  });
});
