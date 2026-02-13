import type { BombermanDirection, TilePosition } from './types.js';

export const GAME_ID_BOMBERMAN = 'bomberman' as const;

export const MAP_WIDTH = 13;
export const MAP_HEIGHT = 11;

export const MAX_PLAYERS = 4;
export const MIN_PLAYERS = 2;

export const MOVE_COOLDOWN_TICKS = 4;
export const BOMB_FUSE_TICKS = 40;
export const FLAME_TICKS = 12;
export const BOMB_BLAST_RADIUS = 2;
export const PLAYER_BOMB_LIMIT = 1;
export const MAX_MATCH_TICKS = 3_600;

export const SOFT_BLOCK_DENSITY = 0.6;

export const PLAYER_SPAWN_POSITIONS: ReadonlyArray<TilePosition> = [
  { x: 1, y: 1 },
  { x: MAP_WIDTH - 2, y: MAP_HEIGHT - 2 },
  { x: 1, y: MAP_HEIGHT - 2 },
  { x: MAP_WIDTH - 2, y: 1 },
];

export const DIRECTION_VECTORS: Readonly<Record<BombermanDirection, { dx: number; dy: number }>> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

export function toTileKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function compareTilePositions(a: TilePosition, b: TilePosition): number {
  if (a.y === b.y) {
    return a.x - b.x;
  }

  return a.y - b.y;
}
