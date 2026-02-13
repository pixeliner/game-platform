import { MOVE_COOLDOWN_TICKS } from '../../constants.js';
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
