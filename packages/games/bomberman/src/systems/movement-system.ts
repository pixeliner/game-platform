import { MOVE_COOLDOWN_TICKS } from '../constants.js';
import { pushBombermanEvent } from '../events.js';
import {
  directionToDelta,
  getPlayerEntityIds,
  isTileWalkableForPlayer,
} from '../state/helpers.js';
import type { BombermanSimulationState } from '../state/setup-world.js';

export function runMovementSystem(state: BombermanSimulationState): void {
  for (const entityId of getPlayerEntityIds(state)) {
    const player = state.world.getComponent(entityId, 'player');
    const position = state.world.getComponent(entityId, 'position');
    if (!player || !position || !player.alive) {
      continue;
    }

    if (player.moveCooldownTicks > 0) {
      player.moveCooldownTicks -= 1;
    }

    if (player.desiredDirection === null || player.moveCooldownTicks > 0) {
      continue;
    }

    const delta = directionToDelta(player.desiredDirection);
    const nextX = position.x + delta.dx;
    const nextY = position.y + delta.dy;

    if (!isTileWalkableForPlayer(state, entityId, player.playerId, nextX, nextY)) {
      continue;
    }

    const from = {
      x: position.x,
      y: position.y,
    };

    position.x = nextX;
    position.y = nextY;
    player.moveCooldownTicks = MOVE_COOLDOWN_TICKS;

    pushBombermanEvent(state, {
      kind: 'player.moved',
      playerId: player.playerId,
      from,
      to: {
        x: position.x,
        y: position.y,
      },
      direction: player.desiredDirection,
    });
  }
}
