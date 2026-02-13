import { describe, expect, it } from 'vitest';

import { runBombSystem } from '../systems/bomb-system.js';
import { getSoftBlockEntityAt } from '../state/helpers.js';
import { createBombermanSimulationState } from '../state/setup-world.js';

function clearSoftBlockAt(state: ReturnType<typeof createBombermanSimulationState>, x: number, y: number): void {
  const blockEntityId = getSoftBlockEntityAt(state, x, y);
  if (blockEntityId !== undefined) {
    state.world.destroyEntity(blockEntityId);
  }
}

describe('bomberman bombs and explosions', () => {
  it('counts down fuse, explodes, and destroys soft blocks in blast path', () => {
    const state = createBombermanSimulationState(
      {
        playerIds: ['p1', 'p2'],
      },
      7,
    );

    clearSoftBlockAt(state, 2, 1);
    clearSoftBlockAt(state, 3, 1);

    const forcedBlockEntity = state.world.createEntity();
    state.world.addComponent(forcedBlockEntity, 'position', { x: 3, y: 1 });
    state.world.addComponent(forcedBlockEntity, 'destructible', { destroyedAtTick: null });

    const p1EntityId = state.playerEntityIdsByPlayerId.get('p1');
    if (!p1EntityId) {
      throw new Error('missing p1 entity');
    }

    const p1 = state.world.getComponent(p1EntityId, 'player');
    if (!p1) {
      throw new Error('missing p1 player');
    }

    p1.queuedBombPlacement = true;
    runBombSystem(state);

    const plantedBombEntityId = state.world.query(['bomb']).at(0);
    if (plantedBombEntityId === undefined) {
      throw new Error('expected planted bomb');
    }

    const plantedBomb = state.world.getComponent(plantedBombEntityId, 'bomb');
    if (!plantedBomb) {
      throw new Error('missing bomb component');
    }

    plantedBomb.fuseTicksRemaining = 1;
    runBombSystem(state);

    expect(state.world.query(['bomb'])).toEqual([]);
    expect(getSoftBlockEntityAt(state, 3, 1)).toBeUndefined();

    const flamePositions = state.world
      .query(['flame', 'position'])
      .map((entityId) => state.world.getComponent(entityId, 'position'))
      .filter((position): position is NonNullable<typeof position> => position !== undefined)
      .map((position) => `${position.x},${position.y}`)
      .sort();

    expect(flamePositions).toContain('1,1');
    expect(flamePositions).toContain('2,1');
    expect(flamePositions).toContain('3,1');

    const eventKinds = state.events.map((envelope) => envelope.event.kind);
    expect(eventKinds).toContain('bomb.exploded');
    expect(eventKinds).toContain('block.destroyed');
  });

  it('chains explosions into neighboring bombs deterministically', () => {
    const state = createBombermanSimulationState(
      {
        playerIds: ['p1', 'p2'],
      },
      19,
    );

    for (const tile of [
      { x: 5, y: 5 },
      { x: 6, y: 5 },
    ]) {
      clearSoftBlockAt(state, tile.x, tile.y);
    }

    const p1EntityId = state.playerEntityIdsByPlayerId.get('p1');
    const p2EntityId = state.playerEntityIdsByPlayerId.get('p2');
    if (!p1EntityId || !p2EntityId) {
      throw new Error('missing player entities');
    }

    const p1 = state.world.getComponent(p1EntityId, 'player');
    const p2 = state.world.getComponent(p2EntityId, 'player');
    if (!p1 || !p2) {
      throw new Error('missing player components');
    }

    p1.activeBombCount = 1;
    p2.activeBombCount = 1;

    const firstBombEntityId = state.world.createEntity();
    state.world.addComponent(firstBombEntityId, 'position', { x: 5, y: 5 });
    state.world.addComponent(firstBombEntityId, 'bomb', {
      ownerPlayerId: 'p1',
      fuseTicksRemaining: 1,
      radius: 2,
      ownerCanPass: false,
    });

    const secondBombEntityId = state.world.createEntity();
    state.world.addComponent(secondBombEntityId, 'position', { x: 6, y: 5 });
    state.world.addComponent(secondBombEntityId, 'bomb', {
      ownerPlayerId: 'p2',
      fuseTicksRemaining: 30,
      radius: 2,
      ownerCanPass: false,
    });

    runBombSystem(state);

    expect(state.world.query(['bomb'])).toEqual([]);

    const explosionEvents = state.events.filter((envelope) => envelope.event.kind === 'bomb.exploded');
    expect(explosionEvents).toHaveLength(2);

    const explodedOwners = explosionEvents
      .map((envelope) =>
        envelope.event.kind === 'bomb.exploded' ? envelope.event.ownerPlayerId : 'unexpected',
      )
      .sort();

    expect(explodedOwners).toEqual(['p1', 'p2']);
  });
});
