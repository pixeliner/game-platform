import { pushBombermanEvent } from '../events.js';
import {
  getFlameEntityIds,
  getPowerupEntityAt,
  popRevealablePendingPowerupDrops,
} from '../state/helpers.js';
import type { BombermanSimulationState } from '../state/setup-world.js';

export function runFlameSystem(state: BombermanSimulationState): void {
  for (const flameEntityId of getFlameEntityIds(state)) {
    const flame = state.world.getComponent(flameEntityId, 'flame');
    if (!flame) {
      continue;
    }

    flame.ticksRemaining -= 1;
    if (flame.ticksRemaining <= 0) {
      state.world.destroyEntity(flameEntityId);
    }
  }

  for (const pendingDrop of popRevealablePendingPowerupDrops(state)) {
    if (getPowerupEntityAt(state, pendingDrop.x, pendingDrop.y) !== undefined) {
      continue;
    }

    const powerupEntityId = state.world.createEntity();
    state.world.addComponent(powerupEntityId, 'position', {
      x: pendingDrop.x,
      y: pendingDrop.y,
    });
    state.world.addComponent(powerupEntityId, 'powerup', {
      kind: pendingDrop.kind,
    });

    pushBombermanEvent(state, {
      kind: 'powerup.spawned',
      x: pendingDrop.x,
      y: pendingDrop.y,
      powerupKind: pendingDrop.kind,
    });
  }
}
