import {
  BOMB_SLIDE_TICKS_PER_TILE,
  MOVE_COOLDOWN_TICKS,
} from '../../constants.js';
import { pushBombermanEvent } from '../../events.js';
import {
  directionToDelta,
  getBombEntitiesAt,
  isTileOpenForBombMovement,
} from '../../state/helpers.js';
import type { GridPositionComponent, PlayerComponent } from '../../state/components.js';
import type { BombermanSimulationState } from '../../state/setup-world.js';
import type { BombermanDirection } from '../../types.js';

export interface BombermanMovementStrategy {
  tick(state: BombermanSimulationState): void;
}

function normalizePositiveInt(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.floor(value));
}

export function getPlayerMoveTicksPerTile(player: PlayerComponent): number {
  player.moveTicksPerTile = normalizePositiveInt(player.moveTicksPerTile, MOVE_COOLDOWN_TICKS);
  return player.moveTicksPerTile;
}

export function initializePlayerMovementState(
  player: PlayerComponent,
  position: GridPositionComponent,
): void {
  const fallbackX = position.x;
  const fallbackY = position.y;

  player.renderX = Number.isFinite(player.renderX) ? player.renderX : fallbackX;
  player.renderY = Number.isFinite(player.renderY) ? player.renderY : fallbackY;

  player.segmentFromX = Number.isFinite(player.segmentFromX) ? player.segmentFromX : player.renderX;
  player.segmentFromY = Number.isFinite(player.segmentFromY) ? player.segmentFromY : player.renderY;
  player.segmentToX = Number.isFinite(player.segmentToX) ? player.segmentToX : player.renderX;
  player.segmentToY = Number.isFinite(player.segmentToY) ? player.segmentToY : player.renderY;

  player.segmentDurationTicks = normalizePositiveInt(
    player.segmentDurationTicks,
    getPlayerMoveTicksPerTile(player),
  );

  player.segmentElapsedTicks = Math.max(
    0,
    Math.min(
      player.segmentDurationTicks,
      Number.isFinite(player.segmentElapsedTicks) ? Math.floor(player.segmentElapsedTicks) : 0,
    ),
  );

  if (!player.segmentActive || player.segmentElapsedTicks >= player.segmentDurationTicks) {
    player.segmentActive = false;
    player.segmentElapsedTicks = 0;
    player.segmentFromX = player.renderX;
    player.segmentFromY = player.renderY;
    player.segmentToX = player.renderX;
    player.segmentToY = player.renderY;
  }
}

export function startPlayerSegment(
  player: PlayerComponent,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  durationTicks: number,
): void {
  player.segmentFromX = fromX;
  player.segmentFromY = fromY;
  player.segmentToX = toX;
  player.segmentToY = toY;
  player.segmentDurationTicks = normalizePositiveInt(durationTicks, getPlayerMoveTicksPerTile(player));
  player.segmentElapsedTicks = 0;
  player.segmentActive = true;
}

export function advancePlayerSegment(player: PlayerComponent): boolean {
  if (!player.segmentActive) {
    return false;
  }

  const durationTicks = normalizePositiveInt(player.segmentDurationTicks, getPlayerMoveTicksPerTile(player));
  player.segmentDurationTicks = durationTicks;
  player.segmentElapsedTicks = Math.min(durationTicks, player.segmentElapsedTicks + 1);

  const progress = player.segmentElapsedTicks / durationTicks;
  player.renderX = player.segmentFromX + (player.segmentToX - player.segmentFromX) * progress;
  player.renderY = player.segmentFromY + (player.segmentToY - player.segmentFromY) * progress;

  if (player.segmentElapsedTicks >= durationTicks) {
    player.segmentActive = false;
    player.segmentElapsedTicks = 0;
    player.renderX = player.segmentToX;
    player.renderY = player.segmentToY;
    return true;
  }

  return false;
}

export function syncRenderToTile(player: PlayerComponent, position: GridPositionComponent): void {
  player.renderX = position.x;
  player.renderY = position.y;
  player.segmentActive = false;
  player.segmentElapsedTicks = 0;
  player.segmentFromX = player.renderX;
  player.segmentFromY = player.renderY;
  player.segmentToX = player.renderX;
  player.segmentToY = player.renderY;
}

export function syncTileToRender(player: PlayerComponent, position: GridPositionComponent): void {
  position.x = Math.round(player.renderX);
  position.y = Math.round(player.renderY);
}

export function directionFromTiles(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): BombermanDirection | null {
  if (toX > fromX) {
    return 'right';
  }

  if (toX < fromX) {
    return 'left';
  }

  if (toY > fromY) {
    return 'down';
  }

  if (toY < fromY) {
    return 'up';
  }

  return null;
}

export function tryKickBombInDirection(
  state: BombermanSimulationState,
  playerEntityId: number,
  player: PlayerComponent,
  bombTileX: number,
  bombTileY: number,
  direction: BombermanDirection,
): boolean {
  if (!player.canKickBombs) {
    return false;
  }

  const bombRecords = getBombEntitiesAt(state, bombTileX, bombTileY);
  const kickable = bombRecords.find((record) => record.movingDirection === null);
  if (!kickable) {
    return false;
  }

  const bomb = state.world.getComponent(kickable.entityId, 'bomb');
  const bombPosition = state.world.getComponent(kickable.entityId, 'position');
  if (!bomb || !bombPosition) {
    return false;
  }

  const delta = directionToDelta(direction);
  const nextBombX = bombPosition.x + delta.dx;
  const nextBombY = bombPosition.y + delta.dy;

  if (!isTileOpenForBombMovement(state, nextBombX, nextBombY, kickable.entityId)) {
    return false;
  }

  bomb.movingDirection = direction;
  bomb.moveCooldownTicks = BOMB_SLIDE_TICKS_PER_TILE;
  bomb.ownerCanPass = false;

  pushBombermanEvent(state, {
    kind: 'bomb.kicked',
    byPlayerId: player.playerId,
    ownerPlayerId: bomb.ownerPlayerId,
    from: {
      x: bombPosition.x,
      y: bombPosition.y,
    },
    to: {
      x: nextBombX,
      y: nextBombY,
    },
    direction,
  });

  return true;
}
