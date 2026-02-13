import { getFlameEntityIds } from '../state/helpers.js';
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
}
