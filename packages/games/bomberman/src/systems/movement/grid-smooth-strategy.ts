import { pushBombermanEvent } from '../../events.js';
import {
  directionToDelta,
  getPlayerEntityIds,
  isTileWalkableForPlayer,
} from '../../state/helpers.js';
import type { BombermanSimulationState } from '../../state/setup-world.js';
import {
  advancePlayerSegment,
  getPlayerMoveTicksPerTile,
  initializePlayerMovementState,
  startPlayerSegment,
  syncRenderToTile,
  type BombermanMovementStrategy,
} from './movement-strategy.js';

export const gridSmoothMovementStrategy: BombermanMovementStrategy = {
  tick(state: BombermanSimulationState): void {
    for (const entityId of getPlayerEntityIds(state)) {
      const player = state.world.getComponent(entityId, 'player');
      const position = state.world.getComponent(entityId, 'position');
      if (!player || !position || !player.alive) {
        continue;
      }

      initializePlayerMovementState(player, position);
      const moveTicksPerTile = getPlayerMoveTicksPerTile(player);

      if (player.moveCooldownTicks > 0) {
        player.moveCooldownTicks -= 1;
      }

      if (player.desiredDirection !== null && player.moveCooldownTicks === 0) {
        const delta = directionToDelta(player.desiredDirection);
        const nextX = position.x + delta.dx;
        const nextY = position.y + delta.dy;

        if (isTileWalkableForPlayer(state, entityId, player.playerId, nextX, nextY)) {
          const fromX = position.x;
          const fromY = position.y;

          position.x = nextX;
          position.y = nextY;
          player.moveCooldownTicks = moveTicksPerTile;

          startPlayerSegment(player, player.renderX, player.renderY, nextX, nextY, moveTicksPerTile);

          pushBombermanEvent(state, {
            kind: 'player.moved',
            playerId: player.playerId,
            from: { x: fromX, y: fromY },
            to: { x: nextX, y: nextY },
            direction: player.desiredDirection,
          });
        }
      }

      if (player.segmentActive) {
        advancePlayerSegment(player);
      } else {
        syncRenderToTile(player, position);
      }
    }
  },
};
