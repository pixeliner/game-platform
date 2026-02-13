import {
  MAP_HEIGHT,
  MAP_WIDTH,
  PLAYER_SPAWN_POSITIONS,
  SOFT_BLOCK_DENSITY,
  compareTilePositions,
  toTileKey,
} from '../constants.js';
import { rollSoftBlockVariant } from '../balance.js';
import type { DeterministicRandom } from '../random.js';
import type { BombermanDestructibleKind, TilePosition } from '../types.js';

export interface InitialSoftBlockPosition extends TilePosition {
  kind: BombermanDestructibleKind;
}

export interface BombermanMapData {
  width: number;
  height: number;
  hardWallPositions: TilePosition[];
  hardWallKeys: Set<string>;
  initialSoftBlockPositions: InitialSoftBlockPosition[];
}

function isInsideBounds(x: number, y: number): boolean {
  return x >= 0 && x < MAP_WIDTH && y >= 0 && y < MAP_HEIGHT;
}

function isHardWall(x: number, y: number): boolean {
  if (!isInsideBounds(x, y)) {
    return true;
  }

  if (x === 0 || y === 0 || x === MAP_WIDTH - 1 || y === MAP_HEIGHT - 1) {
    return true;
  }

  return x % 2 === 0 && y % 2 === 0;
}

function createSpawnSafeKeys(playerCount: number): Set<string> {
  const safe = new Set<string>();

  for (const spawn of PLAYER_SPAWN_POSITIONS.slice(0, playerCount)) {
    safe.add(toTileKey(spawn.x, spawn.y));
    safe.add(toTileKey(spawn.x + 1, spawn.y));
    safe.add(toTileKey(spawn.x - 1, spawn.y));
    safe.add(toTileKey(spawn.x, spawn.y + 1));
    safe.add(toTileKey(spawn.x, spawn.y - 1));
  }

  return safe;
}

export function generateBombermanMap(random: DeterministicRandom, playerCount: number): BombermanMapData {
  const hardWallPositions: TilePosition[] = [];
  const hardWallKeys = new Set<string>();
  const initialSoftBlockPositions: InitialSoftBlockPosition[] = [];
  const spawnSafeKeys = createSpawnSafeKeys(playerCount);

  for (let y = 0; y < MAP_HEIGHT; y += 1) {
    for (let x = 0; x < MAP_WIDTH; x += 1) {
      if (isHardWall(x, y)) {
        hardWallPositions.push({ x, y });
        hardWallKeys.add(toTileKey(x, y));
        continue;
      }

      const tileKey = toTileKey(x, y);
      if (spawnSafeKeys.has(tileKey)) {
        continue;
      }

      if (random.nextFloat() < SOFT_BLOCK_DENSITY) {
        initialSoftBlockPositions.push({
          x,
          y,
          kind: rollSoftBlockVariant(random),
        });
      }
    }
  }

  hardWallPositions.sort(compareTilePositions);
  initialSoftBlockPositions.sort(compareTilePositions);

  return {
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    hardWallPositions,
    hardWallKeys,
    initialSoftBlockPositions,
  };
}
