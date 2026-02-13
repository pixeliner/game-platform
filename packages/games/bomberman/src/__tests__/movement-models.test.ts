import { describe, expect, it } from 'vitest';

import { bombermanModule } from '../module.js';

describe('bomberman movement models', () => {
  it('grid_smooth keeps legacy immediate move event timing', () => {
    const game = bombermanModule.createGame(
      {
        playerIds: ['p1', 'p2'],
        movementModel: 'grid_smooth',
      },
      10,
    );

    game.applyInput('p1', { kind: 'move.intent', direction: 'right' }, 1);
    game.tick();

    const movedEvent = game
      .getEventsSince(0)
      .find((event) => event.event.kind === 'player.moved');

    expect(movedEvent?.event).toEqual({
      kind: 'player.moved',
      playerId: 'p1',
      from: { x: 1, y: 1 },
      to: { x: 2, y: 1 },
      direction: 'right',
    });
  });

  it('true_transit emits movement event on segment completion and snapshots fractional positions', () => {
    const game = bombermanModule.createGame(
      {
        playerIds: ['p1', 'p2'],
        movementModel: 'true_transit',
      },
      10,
    );

    game.applyInput('p1', { kind: 'move.intent', direction: 'right' }, 1);
    game.tick();

    const firstSnapshot = game.getSnapshot();
    const p1AfterFirstTick = firstSnapshot.players.find((player) => player.playerId === 'p1');
    expect(p1AfterFirstTick?.x).toBeCloseTo(1.25, 5);
    expect(p1AfterFirstTick?.y).toBe(1);
    expect(game.getEventsSince(0).find((event) => event.event.kind === 'player.moved')).toBeUndefined();

    game.tick();
    game.tick();
    game.tick();

    const finalSnapshot = game.getSnapshot();
    const p1AfterFourthTick = finalSnapshot.players.find((player) => player.playerId === 'p1');
    expect(p1AfterFourthTick?.x).toBe(2);
    expect(p1AfterFourthTick?.y).toBe(1);

    const movedEvent = game
      .getEventsSince(0)
      .find((event) => event.event.kind === 'player.moved');
    expect(movedEvent?.event).toEqual({
      kind: 'player.moved',
      playerId: 'p1',
      from: { x: 1, y: 1 },
      to: { x: 2, y: 1 },
      direction: 'right',
    });
  });
});
