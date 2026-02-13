import type { EntityId } from '@game-platform/engine';

import { pushBombermanEvent } from '../../events.js';
import {
  directionToDelta,
  getPlayerEntityIds,
  isTileWalkableForPlayer,
} from '../../state/helpers.js';
import type { BombermanSimulationState } from '../../state/setup-world.js';
import {
  advancePlayerSegment,
  directionFromTiles,
  getPlayerMoveTicksPerTile,
  initializePlayerMovementState,
  startPlayerSegment,
  syncTileToRender,
  tryKickBombInDirection,
  type BombermanMovementStrategy,
} from './movement-strategy.js';

function emitCompletedMovementEvent(state: BombermanSimulationState, entityId: EntityId): void {
  const player = state.world.getComponent(entityId, 'player');
  if (!player) {
    return;
  }

  const fromX = Math.round(player.segmentFromX);
  const fromY = Math.round(player.segmentFromY);
  const toX = Math.round(player.segmentToX);
  const toY = Math.round(player.segmentToY);
  const direction = directionFromTiles(fromX, fromY, toX, toY);

  if (direction === null || (fromX === toX && fromY === toY)) {
    return;
  }

  pushBombermanEvent(state, {
    kind: 'player.moved',
    playerId: player.playerId,
    from: { x: fromX, y: fromY },
    to: { x: toX, y: toY },
    direction,
  });
}

export const trueTransitMovementStrategy: BombermanMovementStrategy = {
  tick(state: BombermanSimulationState): void {
    for (const entityId of getPlayerEntityIds(state)) {
      const player = state.world.getComponent(entityId, 'player');
      const position = state.world.getComponent(entityId, 'position');
      if (!player || !position || !player.alive) {
        continue;
      }

      initializePlayerMovementState(player, position);
      const moveTicksPerTile = getPlayerMoveTicksPerTile(player);

      if (player.segmentActive) {
        const completed = advancePlayerSegment(player);
        syncTileToRender(player, position);

        if (completed) {
          player.moveCooldownTicks = 0;
          emitCompletedMovementEvent(state, entityId);
        } else {
          player.moveCooldownTicks = Math.max(
            1,
            player.segmentDurationTicks - player.segmentElapsedTicks,
          );
          continue;
        }
      }

      if (player.desiredDirection === null) {
        continue;
      }

      const delta = directionToDelta(player.desiredDirection);
      const nextX = position.x + delta.dx;
      const nextY = position.y + delta.dy;

      player.lastFacingDirection = player.desiredDirection;

      if (!isTileWalkableForPlayer(state, entityId, player.playerId, nextX, nextY)) {
        const kicked = tryKickBombInDirection(
          state,
          entityId,
          player,
          nextX,
          nextY,
          player.desiredDirection,
        );

        if (kicked) {
          player.moveCooldownTicks = 1;
        }
        continue;
      }

      startPlayerSegment(
        player,
        position.x,
        position.y,
        nextX,
        nextY,
        moveTicksPerTile,
      );
      player.moveCooldownTicks = moveTicksPerTile;

      const completed = advancePlayerSegment(player);
      syncTileToRender(player, position);

      if (completed) {
        player.moveCooldownTicks = 0;
        emitCompletedMovementEvent(state, entityId);
      }
    }
  },
};
