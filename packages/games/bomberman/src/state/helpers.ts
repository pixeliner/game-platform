import type { EntityId } from '@game-platform/engine';

import { MAP_HEIGHT, MAP_WIDTH, compareTilePositions, toTileKey } from '../constants.js';
import type {
  BombermanDirection,
  BombermanPowerupKind,
  TilePosition,
} from '../types.js';
import type { BombermanSimulationState } from './setup-world.js';

export interface TileBombRecord {
  entityId: EntityId;
  ownerPlayerId: string;
  ownerCanPass: boolean;
  movingDirection: BombermanDirection | null;
}

export interface PendingPowerupDropRecord {
  x: number;
  y: number;
  kind: BombermanPowerupKind;
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

export function getPowerupEntityIds(state: BombermanSimulationState): EntityId[] {
  return state.world.query(['powerup', 'position']);
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

export function getPowerupEntityAt(state: BombermanSimulationState, x: number, y: number): EntityId | undefined {
  for (const entityId of getPowerupEntityIds(state)) {
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
        movingDirection: bomb.movingDirection,
      });
    }
  }

  records.sort((a, b) => a.entityId - b.entityId);
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

export function hasFlameAt(state: BombermanSimulationState, x: number, y: number): boolean {
  for (const entityId of getFlameEntityIds(state)) {
    const position = state.world.getComponent(entityId, 'position');
    if (!position) {
      continue;
    }

    if (position.x === x && position.y === y) {
      return true;
    }
  }

  return false;
}

export function setPendingPowerupDrop(
  state: BombermanSimulationState,
  x: number,
  y: number,
  kind: BombermanPowerupKind,
): void {
  state.pendingPowerupDropsByTileKey.set(toTileKey(x, y), {
    x,
    y,
    kind,
  });
}

export function popRevealablePendingPowerupDrops(
  state: BombermanSimulationState,
): PendingPowerupDropRecord[] {
  const revealable: PendingPowerupDropRecord[] = [];
  const entries = [...state.pendingPowerupDropsByTileKey.entries()].sort((a, b) => {
    const byY = a[1].y - b[1].y;
    if (byY !== 0) {
      return byY;
    }

    const byX = a[1].x - b[1].x;
    if (byX !== 0) {
      return byX;
    }

    return a[1].kind.localeCompare(b[1].kind);
  });

  for (const [tileKey, pendingDrop] of entries) {
    if (hasFlameAt(state, pendingDrop.x, pendingDrop.y)) {
      continue;
    }

    revealable.push(pendingDrop);
    state.pendingPowerupDropsByTileKey.delete(tileKey);
  }

  return revealable;
}

export function hasAlivePlayerAt(
  state: BombermanSimulationState,
  x: number,
  y: number,
  excludePlayerEntityId?: EntityId,
): boolean {
  for (const entityId of getPlayerEntityIds(state)) {
    if (excludePlayerEntityId !== undefined && entityId === excludePlayerEntityId) {
      continue;
    }

    const player = state.world.getComponent(entityId, 'player');
    const position = state.world.getComponent(entityId, 'position');
    if (!player || !position || !player.alive) {
      continue;
    }

    if (position.x === x && position.y === y) {
      return true;
    }
  }

  return false;
}

export function isTileOpenForBombMovement(
  state: BombermanSimulationState,
  x: number,
  y: number,
  movingBombEntityId?: EntityId,
): boolean {
  if (!isInsideMap(x, y) || isHardWall(state, x, y)) {
    return false;
  }

  if (getSoftBlockEntityAt(state, x, y) !== undefined) {
    return false;
  }

  if (hasAlivePlayerAt(state, x, y)) {
    return false;
  }

  const bombs = getBombEntitiesAt(state, x, y);
  return bombs.every((bomb) => bomb.entityId === movingBombEntityId);
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
    if (bomb.ownerPlayerId === playerId && bomb.ownerCanPass && bomb.movingDirection === null) {
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
