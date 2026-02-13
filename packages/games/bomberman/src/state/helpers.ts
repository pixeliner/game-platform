import type { EntityId } from '@game-platform/engine';

import { MAP_HEIGHT, MAP_WIDTH, compareTilePositions, toTileKey } from '../constants.js';
import type { BombermanDirection, TilePosition } from '../types.js';
import type { BombermanSimulationState } from './setup-world.js';

export interface TileBombRecord {
  entityId: EntityId;
  ownerPlayerId: string;
  ownerCanPass: boolean;
}

export function isInsideMap(x: number, y: number): boolean {
  return x >= 0 && x < MAP_WIDTH && y >= 0 && y < MAP_HEIGHT;
}

export function isHardWall(state: BombermanSimulationState, x: number, y: number): boolean {
  return state.map.hardWallKeys.has(toTileKey(x, y));
}

export function getPlayerEntityIds(state: BombermanSimulationState): EntityId[] {
  return state.world.query(['player', 'position']);
}

export function getBombEntityIds(state: BombermanSimulationState): EntityId[] {
  return state.world.query(['bomb', 'position']);
}

export function getFlameEntityIds(state: BombermanSimulationState): EntityId[] {
  return state.world.query(['flame', 'position']);
}

export function getSoftBlockEntityIds(state: BombermanSimulationState): EntityId[] {
  return state.world.query(['destructible', 'position']);
}

export function getSoftBlockEntityAt(state: BombermanSimulationState, x: number, y: number): EntityId | undefined {
  for (const entityId of getSoftBlockEntityIds(state)) {
    const position = state.world.getComponent(entityId, 'position');
    if (!position) {
      continue;
    }

    if (position.x === x && position.y === y) {
      return entityId;
    }
  }

  return undefined;
}

export function getBombEntitiesAt(state: BombermanSimulationState, x: number, y: number): TileBombRecord[] {
  const records: TileBombRecord[] = [];

  for (const entityId of getBombEntityIds(state)) {
    const bomb = state.world.getComponent(entityId, 'bomb');
    const position = state.world.getComponent(entityId, 'position');
    if (!bomb || !position) {
      continue;
    }

    if (position.x === x && position.y === y) {
      records.push({
        entityId,
        ownerPlayerId: bomb.ownerPlayerId,
        ownerCanPass: bomb.ownerCanPass,
      });
    }
  }

  return records;
}

export function getFlameOwnersAt(state: BombermanSimulationState, x: number, y: number): string[] {
  const owners: string[] = [];

  for (const entityId of getFlameEntityIds(state)) {
    const flame = state.world.getComponent(entityId, 'flame');
    const position = state.world.getComponent(entityId, 'position');
    if (!flame || !position) {
      continue;
    }

    if (position.x === x && position.y === y && flame.sourceOwnerPlayerId !== null) {
      owners.push(flame.sourceOwnerPlayerId);
    }
  }

  owners.sort((a, b) => a.localeCompare(b));
  return owners;
}

export function isTileWalkableForPlayer(
  state: BombermanSimulationState,
  playerEntityId: EntityId,
  playerId: string,
  x: number,
  y: number,
): boolean {
  if (!isInsideMap(x, y) || isHardWall(state, x, y)) {
    return false;
  }

  if (getSoftBlockEntityAt(state, x, y) !== undefined) {
    return false;
  }

  const bombs = getBombEntitiesAt(state, x, y);
  if (bombs.length === 0) {
    return true;
  }

  const playerPosition = state.world.getComponent(playerEntityId, 'position');
  if (!playerPosition) {
    return false;
  }

  for (const bomb of bombs) {
    if (bomb.ownerPlayerId === playerId && bomb.ownerCanPass) {
      const isStandingOnBombTile = playerPosition.x === x && playerPosition.y === y;
      if (isStandingOnBombTile) {
        continue;
      }
    }

    return false;
  }

  return true;
}

export function compareEntityTilePosition(
  state: BombermanSimulationState,
  aEntityId: EntityId,
  bEntityId: EntityId,
): number {
  const aPosition = state.world.getComponent(aEntityId, 'position');
  const bPosition = state.world.getComponent(bEntityId, 'position');

  if (!aPosition || !bPosition) {
    return aEntityId - bEntityId;
  }

  const byTile = compareTilePositions(aPosition, bPosition);
  if (byTile !== 0) {
    return byTile;
  }

  return aEntityId - bEntityId;
}

export function directionToDelta(direction: BombermanDirection): { dx: number; dy: number } {
  switch (direction) {
    case 'up':
      return { dx: 0, dy: -1 };
    case 'down':
      return { dx: 0, dy: 1 };
    case 'left':
      return { dx: -1, dy: 0 };
    case 'right':
      return { dx: 1, dy: 0 };
  }
}

export function createPositionSetKey(position: TilePosition): string {
  return toTileKey(position.x, position.y);
}
