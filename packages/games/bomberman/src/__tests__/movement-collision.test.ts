import { describe, expect, it } from 'vitest';

import { runBombSystem } from '../systems/bomb-system.js';
import { runMovementSystem } from '../systems/movement-system.js';
import { createBombermanSimulationState } from '../state/setup-world.js';

function getPlayerPosition(
  state: ReturnType<typeof createBombermanSimulationState>,
  playerId: string,
): { x: number; y: number } {
  const entityId = state.playerEntityIdsByPlayerId.get(playerId);
  if (!entityId) {
    throw new Error(`Missing player entity for ${playerId}`);
  }

  const position = state.world.getComponent(entityId, 'position');
  if (!position) {
    throw new Error(`Missing position for ${playerId}`);
  }

  return {
    x: position.x,
    y: position.y,
  };
}

describe('bomberman movement and collision', () => {
  it('blocks movement into hard walls and soft blocks', () => {
    const state = createBombermanSimulationState(
      {
        playerIds: ['p1', 'p2'],
      },
      11,
    );

    const p1EntityId = state.playerEntityIdsByPlayerId.get('p1');
    if (!p1EntityId) {
      throw new Error('missing p1 entity');
    }

    const player = state.world.getComponent(p1EntityId, 'player');
    if (!player) {
      throw new Error('missing p1 component');
    }

    player.desiredDirection = 'left';
    runMovementSystem(state);

    expect(getPlayerPosition(state, 'p1')).toEqual({ x: 1, y: 1 });

    const forcedSoftBlock = state.world.createEntity();
    state.world.addComponent(forcedSoftBlock, 'position', { x: 2, y: 1 });
    state.world.addComponent(forcedSoftBlock, 'destructible', { destroyedAtTick: null, kind: 'brick' });

    player.desiredDirection = 'right';
    player.moveCooldownTicks = 0;
    runMovementSystem(state);

    expect(getPlayerPosition(state, 'p1')).toEqual({ x: 1, y: 1 });
  });

  it('allows owner bomb pass-through only while leaving the planted tile', () => {
    const state = createBombermanSimulationState(
      {
        playerIds: ['p1', 'p2'],
      },
      17,
    );

    const p1EntityId = state.playerEntityIdsByPlayerId.get('p1');
    if (!p1EntityId) {
      throw new Error('missing p1 entity');
    }

    const player = state.world.getComponent(p1EntityId, 'player');
    if (!player) {
      throw new Error('missing player component');
    }

    player.queuedBombPlacement = true;
    runBombSystem(state);

    player.desiredDirection = 'right';
    player.moveCooldownTicks = 0;
    runMovementSystem(state);

    expect(getPlayerPosition(state, 'p1')).toEqual({ x: 2, y: 1 });

    runBombSystem(state);

    player.desiredDirection = 'left';
    player.moveCooldownTicks = 0;
    runMovementSystem(state);

    expect(getPlayerPosition(state, 'p1')).toEqual({ x: 2, y: 1 });
  });
});
