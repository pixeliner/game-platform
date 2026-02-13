import type { BombermanSimulationState } from '../state/setup-world.js';
import { gridSmoothMovementStrategy } from './movement/grid-smooth-strategy.js';
import { trueTransitMovementStrategy } from './movement/true-transit-strategy.js';

export function runMovementSystem(state: BombermanSimulationState): void {
  if (state.movementModel === 'true_transit') {
    trueTransitMovementStrategy.tick(state);
    return;
  }

  gridSmoothMovementStrategy.tick(state);
}
