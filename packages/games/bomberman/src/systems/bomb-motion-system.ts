import { BOMB_SLIDE_TICKS_PER_TILE } from '../constants.js';
import {
  directionToDelta,
  getBombEntityIds,
  isTileOpenForBombMovement,
} from '../state/helpers.js';
import type { BombermanSimulationState } from '../state/setup-world.js';

export function runBombMotionSystem(state: BombermanSimulationState): void {
  for (const bombEntityId of getBombEntityIds(state)) {
    const bomb = state.world.getComponent(bombEntityId, 'bomb');
    const position = state.world.getComponent(bombEntityId, 'position');
    if (!bomb || !position || bomb.movingDirection === null) {
      continue;
    }

    if (bomb.moveCooldownTicks > 0) {
      bomb.moveCooldownTicks -= 1;
      continue;
    }

    const delta = directionToDelta(bomb.movingDirection);
    const nextX = position.x + delta.dx;
    const nextY = position.y + delta.dy;

    if (!isTileOpenForBombMovement(state, nextX, nextY, bombEntityId)) {
      bomb.movingDirection = null;
      bomb.moveCooldownTicks = 0;
      continue;
    }

    position.x = nextX;
    position.y = nextY;
    bomb.ownerCanPass = false;
    bomb.moveCooldownTicks = BOMB_SLIDE_TICKS_PER_TILE;
  }
}
