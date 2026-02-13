import { describe, expect, it } from 'vitest';

import { getPlayerEntityIds } from '../state/helpers.js';
import { createBombermanSimulationState } from '../state/setup-world.js';
import { runPowerupSystem } from '../systems/powerup-system.js';

function getPlayer(
  state: ReturnType<typeof createBombermanSimulationState>,
  playerId: string,
) {
  const entityId = state.playerEntityIdsByPlayerId.get(playerId);
  if (!entityId) {
    throw new Error(`Missing player entity for ${playerId}`);
  }

  const player = state.world.getComponent(entityId, 'player');
  if (!player) {
    throw new Error(`Missing player component for ${playerId}`);
  }

  return {
    entityId,
    player,
  };
}

describe('bomberman powerups (core)', () => {
  it('collects bomb/blast/speed powerups and applies progression with caps', () => {
    const state = createBombermanSimulationState({ playerIds: ['p1', 'p2'] }, 91);
    const { player } = getPlayer(state, 'p1');

    const orderedKinds = [
      'bomb_up',
      'bomb_up',
      'bomb_up',
      'bomb_up',
      'bomb_up',
      'blast_up',
      'blast_up',
      'blast_up',
      'blast_up',
      'blast_up',
      'blast_up',
      'speed_up',
      'speed_up',
      'speed_up',
      'speed_up',
    ] as const;

    for (const kind of orderedKinds) {
      const powerupEntityId = state.world.createEntity();
      state.world.addComponent(powerupEntityId, 'position', { x: 1, y: 1 });
      state.world.addComponent(powerupEntityId, 'powerup', { kind });
      runPowerupSystem(state);
    }

    expect(player.bombLimit).toBe(5);
    expect(player.blastRadius).toBe(6);
    expect(player.speedTier).toBe(3);
    expect(player.moveTicksPerTile).toBe(2);

    const collectedEvents = state.events.filter((event) => event.event.kind === 'powerup.collected');
    expect(collectedEvents).toHaveLength(orderedKinds.length);
  });

  it('collects advanced ability powerups and toggles capability flags', () => {
    const state = createBombermanSimulationState({ playerIds: ['p1', 'p2'] }, 92);
    const { player } = getPlayer(state, 'p1');

    for (const kind of ['remote_detonator', 'kick_bombs', 'throw_bombs'] as const) {
      const powerupEntityId = state.world.createEntity();
      state.world.addComponent(powerupEntityId, 'position', { x: 1, y: 1 });
      state.world.addComponent(powerupEntityId, 'powerup', { kind });
      runPowerupSystem(state);
    }

    expect(player.hasRemoteDetonator).toBe(true);
    expect(player.canKickBombs).toBe(true);
    expect(player.canThrowBombs).toBe(true);

    expect(getPlayerEntityIds(state)).toHaveLength(2);
  });

  it('only collects materialized powerups, not pending unrevealed drops', () => {
    const state = createBombermanSimulationState({ playerIds: ['p1', 'p2'] }, 93);
    const { player } = getPlayer(state, 'p1');

    state.pendingPowerupDropsByTileKey.set('1,1', {
      x: 1,
      y: 1,
      kind: 'bomb_up',
    });

    runPowerupSystem(state);

    expect(player.bombLimit).toBe(1);
    expect(state.events.filter((event) => event.event.kind === 'powerup.collected')).toHaveLength(0);
  });
});
