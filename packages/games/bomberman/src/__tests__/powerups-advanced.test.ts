import { describe, expect, it } from 'vitest';

import { runBombMotionSystem } from '../systems/bomb-motion-system.js';
import { runBombSystem } from '../systems/bomb-system.js';
import { runMovementSystem } from '../systems/movement-system.js';
import { getBombEntityIds, getSoftBlockEntityAt } from '../state/helpers.js';
import { createBombermanSimulationState } from '../state/setup-world.js';

function getPlayer(
  state: ReturnType<typeof createBombermanSimulationState>,
  playerId: string,
) {
  const entityId = state.playerEntityIdsByPlayerId.get(playerId);
  if (!entityId) {
    throw new Error(`Missing player entity for ${playerId}`);
  }

  const player = state.world.getComponent(entityId, 'player');
  const position = state.world.getComponent(entityId, 'position');
  if (!player || !position) {
    throw new Error(`Missing player state for ${playerId}`);
  }

  return {
    entityId,
    player,
    position,
  };
}

describe('bomberman powerups (advanced)', () => {
  it('remote detonate targets oldest owned active bomb deterministically', () => {
    const state = createBombermanSimulationState({ playerIds: ['p1', 'p2'] }, 510);
    const { player } = getPlayer(state, 'p1');

    player.hasRemoteDetonator = true;
    player.activeBombCount = 2;
    player.queuedRemoteDetonation = true;

    const bombA = state.world.createEntity();
    state.world.addComponent(bombA, 'position', { x: 3, y: 1 });
    state.world.addComponent(bombA, 'bomb', {
      ownerPlayerId: 'p1',
      fuseTicksRemaining: 30,
      radius: 2,
      ownerCanPass: false,
      placedAtTick: 4,
      movingDirection: null,
      moveCooldownTicks: 0,
    });

    const bombB = state.world.createEntity();
    state.world.addComponent(bombB, 'position', { x: 9, y: 9 });
    state.world.addComponent(bombB, 'bomb', {
      ownerPlayerId: 'p1',
      fuseTicksRemaining: 30,
      radius: 2,
      ownerCanPass: false,
      placedAtTick: 8,
      movingDirection: null,
      moveCooldownTicks: 0,
    });

    runBombSystem(state);

    const remainingBombs = getBombEntityIds(state);
    expect(remainingBombs).toContain(bombB);
    expect(remainingBombs).not.toContain(bombA);

    const remoteEvent = state.events.find((event) => event.event.kind === 'bomb.remote_detonated');
    expect(remoteEvent?.event.kind).toBe('bomb.remote_detonated');
    if (remoteEvent?.event.kind === 'bomb.remote_detonated') {
      expect(remoteEvent.event.playerId).toBe('p1');
      expect(remoteEvent.event.x).toBe(3);
      expect(remoteEvent.event.y).toBe(1);
    }
  });

  it('kick_bombs passively starts sliding bombs on movement collision', () => {
    const state = createBombermanSimulationState({ playerIds: ['p1', 'p2'] }, 511);
    const p1 = getPlayer(state, 'p1');

    p1.player.canKickBombs = true;
    p1.player.desiredDirection = 'right';
    p1.player.moveCooldownTicks = 0;

    const blockingBlock = getSoftBlockEntityAt(state, 3, 1);
    if (blockingBlock !== undefined) {
      state.world.destroyEntity(blockingBlock);
    }

    const bombEntityId = state.world.createEntity();
    state.world.addComponent(bombEntityId, 'position', { x: 2, y: 1 });
    state.world.addComponent(bombEntityId, 'bomb', {
      ownerPlayerId: 'p2',
      fuseTicksRemaining: 30,
      radius: 2,
      ownerCanPass: false,
      placedAtTick: 1,
      movingDirection: null,
      moveCooldownTicks: 0,
    });

    runMovementSystem(state);

    const bombAfterKick = state.world.getComponent(bombEntityId, 'bomb');
    expect(bombAfterKick?.movingDirection).toBe('right');

    runBombMotionSystem(state);
    runBombMotionSystem(state);
    runBombMotionSystem(state);

    const bombPosition = state.world.getComponent(bombEntityId, 'position');
    expect(bombPosition).toEqual({ x: 3, y: 1 });

    const kickEvent = state.events.find((event) => event.event.kind === 'bomb.kicked');
    expect(kickEvent?.event.kind).toBe('bomb.kicked');
  });

  it('throw_bombs relocates a bomb to the furthest valid tile in facing direction', () => {
    const state = createBombermanSimulationState({ playerIds: ['p1', 'p2'] }, 512);
    const p1 = getPlayer(state, 'p1');

    p1.player.canThrowBombs = true;
    p1.player.desiredDirection = 'right';
    p1.player.queuedBombThrow = true;

    for (const x of [2, 3, 4, 5]) {
      const softBlockEntityId = getSoftBlockEntityAt(state, x, 1);
      if (softBlockEntityId !== undefined) {
        state.world.destroyEntity(softBlockEntityId);
      }
    }

    const blockingSoftBlock = state.world.createEntity();
    state.world.addComponent(blockingSoftBlock, 'position', { x: 6, y: 1 });
    state.world.addComponent(blockingSoftBlock, 'destructible', {
      destroyedAtTick: null,
      kind: 'crate',
    });

    const bombEntityId = state.world.createEntity();
    state.world.addComponent(bombEntityId, 'position', { x: 1, y: 1 });
    state.world.addComponent(bombEntityId, 'bomb', {
      ownerPlayerId: 'p1',
      fuseTicksRemaining: 30,
      radius: 2,
      ownerCanPass: true,
      placedAtTick: 3,
      movingDirection: null,
      moveCooldownTicks: 0,
    });

    runBombSystem(state);

    const bombPosition = state.world.getComponent(bombEntityId, 'position');
    expect(bombPosition).toEqual({ x: 5, y: 1 });

    const throwEvent = state.events.find((event) => event.event.kind === 'bomb.thrown');
    expect(throwEvent?.event.kind).toBe('bomb.thrown');
    if (throwEvent?.event.kind === 'bomb.thrown') {
      expect(throwEvent.event.direction).toBe('right');
      expect(throwEvent.event.from).toEqual({ x: 1, y: 1 });
      expect(throwEvent.event.to).toEqual({ x: 5, y: 1 });
    }
  });
});
