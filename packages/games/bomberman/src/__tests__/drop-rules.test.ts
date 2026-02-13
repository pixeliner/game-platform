import { describe, expect, it } from 'vitest';

import {
  DROP_CHANCE_BY_BLOCK_KIND,
  POWERUP_DROP_WEIGHTS,
  rollPowerupDrop,
  rollSoftBlockVariant,
} from '../balance.js';
import { DeterministicRandom } from '../random.js';
import { runBombSystem } from '../systems/bomb-system.js';
import { runFlameSystem } from '../systems/flame-system.js';
import { createBombermanSimulationState } from '../state/setup-world.js';
import type { BombermanPowerupKind } from '../types.js';

const POWERUP_KIND_SET = new Set<BombermanPowerupKind>(POWERUP_DROP_WEIGHTS.map((entry) => entry.value));

describe('bomberman drop rules', () => {
  it('produces deterministic soft block variant sequences for the same seed', () => {
    const firstRandom = new DeterministicRandom(123456);
    const secondRandom = new DeterministicRandom(123456);

    const first = Array.from({ length: 20 }, () => rollSoftBlockVariant(firstRandom));
    const second = Array.from({ length: 20 }, () => rollSoftBlockVariant(secondRandom));

    expect(second).toEqual(first);
  });

  it('produces deterministic weighted drop decisions bounded to valid powerup kinds', () => {
    const firstRandom = new DeterministicRandom(33);
    const secondRandom = new DeterministicRandom(33);

    const first = Array.from({ length: 50 }, () => rollPowerupDrop(firstRandom, 'barrel'));
    const second = Array.from({ length: 50 }, () => rollPowerupDrop(secondRandom, 'barrel'));

    expect(second).toEqual(first);

    for (const value of first) {
      if (value === null) {
        continue;
      }

      expect(POWERUP_KIND_SET.has(value)).toBe(true);
    }
  });

  it('emits deterministic block.destroyed drop payloads for identical seeds and actions', () => {
    const runScript = (): Array<BombermanPowerupKind | null> => {
      const state = createBombermanSimulationState({ playerIds: ['p1', 'p2'] }, 9001);

      const blockEntityId = state.world.createEntity();
      state.world.addComponent(blockEntityId, 'position', { x: 3, y: 1 });
      state.world.addComponent(blockEntityId, 'destructible', {
        destroyedAtTick: null,
        kind: 'barrel',
      });

      const playerEntityId = state.playerEntityIdsByPlayerId.get('p1');
      const player = playerEntityId ? state.world.getComponent(playerEntityId, 'player') : undefined;
      if (!player) {
        throw new Error('Missing p1 player');
      }

      player.queuedBombPlacement = true;
      runBombSystem(state);

      const plantedBombId = state.world.query(['bomb']).at(0);
      if (plantedBombId === undefined) {
        throw new Error('Bomb was not planted');
      }

      const plantedBomb = state.world.getComponent(plantedBombId, 'bomb');
      if (!plantedBomb) {
        throw new Error('Bomb component missing');
      }

      plantedBomb.fuseTicksRemaining = 1;
      runBombSystem(state);

      return state.events
        .filter((event) => event.event.kind === 'block.destroyed')
        .map((event) => (event.event.kind === 'block.destroyed' ? event.event.droppedPowerupKind : null));
    };

    const first = runScript();
    const second = runScript();

    expect(second).toEqual(first);
  });

  it('keeps drop chances configured in expected deterministic profile', () => {
    expect(DROP_CHANCE_BY_BLOCK_KIND).toEqual({
      brick: 0.3,
      crate: 0.4,
      barrel: 0.5,
    });
  });

  it('delays powerup.spawned until the flame tile has cleared', () => {
    const state = createBombermanSimulationState({ playerIds: ['p1', 'p2'] }, 9010);

    const forcedBlockEntity = state.world.createEntity();
    state.world.addComponent(forcedBlockEntity, 'position', { x: 3, y: 1 });
    state.world.addComponent(forcedBlockEntity, 'destructible', {
      destroyedAtTick: null,
      kind: 'crate',
    });

    state.random.nextFloat = (): number => 0;

    const playerEntityId = state.playerEntityIdsByPlayerId.get('p1');
    const player = playerEntityId ? state.world.getComponent(playerEntityId, 'player') : undefined;
    if (!player) {
      throw new Error('Missing p1 player');
    }

    player.queuedBombPlacement = true;
    runBombSystem(state);

    const plantedBombId = state.world.query(['bomb']).at(0);
    if (plantedBombId === undefined) {
      throw new Error('Bomb was not planted');
    }

    const plantedBomb = state.world.getComponent(plantedBombId, 'bomb');
    if (!plantedBomb) {
      throw new Error('Bomb component missing');
    }

    plantedBomb.fuseTicksRemaining = 1;
    runBombSystem(state);

    const blockDestroyedIndex = state.events.findIndex((event) => event.event.kind === 'block.destroyed');
    expect(blockDestroyedIndex).toBeGreaterThanOrEqual(0);
    expect(state.events.find((event) => event.event.kind === 'powerup.spawned')).toBeUndefined();

    runFlameSystem(state);
    expect(state.events.find((event) => event.event.kind === 'powerup.spawned')).toBeUndefined();

    for (let index = 0; index < 16; index += 1) {
      runFlameSystem(state);
    }

    const spawnedIndex = state.events.findIndex((event) => event.event.kind === 'powerup.spawned');
    expect(spawnedIndex).toBeGreaterThan(blockDestroyedIndex);
  });
});
