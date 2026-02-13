import { describe, expect, it } from 'vitest';

import { bombermanModule } from '../module.js';
import type {
  BombermanInput,
  BombermanMovementModel,
  BombermanSnapshot,
} from '../types.js';

interface ScenarioOutput {
  snapshots: BombermanSnapshot[];
  events: ReturnType<ReturnType<typeof bombermanModule.createGame>['getEventsSince']>;
  results: ReturnType<ReturnType<typeof bombermanModule.createGame>['getResults']>;
}

function runScenario(seed: number, movementModel: BombermanMovementModel = 'grid_smooth'): ScenarioOutput {
  const game = bombermanModule.createGame(
    {
      playerIds: ['p1', 'p2'],
      movementModel,
    },
    seed,
  );

  const timeline = new Map<number, Array<{ playerId: string; input: BombermanInput }>>([
    [1, [{ playerId: 'p1', input: { kind: 'move.intent', direction: 'right' } }]],
    [2, [{ playerId: 'p1', input: { kind: 'bomb.place' } }]],
    [6, [{ playerId: 'p1', input: { kind: 'move.intent', direction: null } }]],
    [8, [{ playerId: 'p2', input: { kind: 'move.intent', direction: 'up' } }]],
    [14, [{ playerId: 'p2', input: { kind: 'move.intent', direction: null } }]],
  ]);

  const snapshots: BombermanSnapshot[] = [game.getSnapshot()];

  for (let tick = 1; tick <= 80; tick += 1) {
    for (const command of timeline.get(tick) ?? []) {
      game.applyInput(command.playerId, command.input, tick);
    }

    game.tick();

    if (tick % 5 === 0) {
      snapshots.push(game.getSnapshot());
    }

    if (game.isGameOver()) {
      break;
    }
  }

  return {
    snapshots,
    events: game.getEventsSince(0),
    results: game.getResults(),
  };
}

describe('bomberman determinism', () => {
  it('produces identical snapshots/events/results for same seed and inputs', () => {
    const first = runScenario(12345);
    const second = runScenario(12345);

    expect(second).toEqual(first);
  });

  it('is deterministic for true_transit movement model with the same seed and inputs', () => {
    const first = runScenario(12345, 'true_transit');
    const second = runScenario(12345, 'true_transit');

    expect(second).toEqual(first);
  });

  it('produces different soft block layout for different seeds', () => {
    const first = runScenario(111);
    const second = runScenario(222);

    expect(second.snapshots[0]?.softBlocks).not.toEqual(first.snapshots[0]?.softBlocks);
  });
});
