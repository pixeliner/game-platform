import type { EntityId } from '@game-platform/engine';

import {
  BOMB_BLAST_RADIUS,
  BOMB_FUSE_TICKS,
  DIRECTION_VECTORS,
  FLAME_TICKS,
  PLAYER_BOMB_LIMIT,
  toTileKey,
} from '../constants.js';
import { pushBombermanEvent } from '../events.js';
import {
  getBombEntitiesAt,
  getBombEntityIds,
  getPlayerEntityIds,
  getSoftBlockEntityAt,
  isHardWall,
  isInsideMap,
} from '../state/helpers.js';
import type { BombermanSimulationState } from '../state/setup-world.js';
import type { TilePosition } from '../types.js';

export function runBombSystem(state: BombermanSimulationState): void {
  placeQueuedBombs(state);
  updateOwnerPassThrough(state);

  const bombIdsToExplode: EntityId[] = [];
  for (const bombEntityId of getBombEntityIds(state)) {
    const bomb = state.world.getComponent(bombEntityId, 'bomb');
    if (!bomb) {
      continue;
    }

    bomb.fuseTicksRemaining -= 1;
    if (bomb.fuseTicksRemaining <= 0) {
      bombIdsToExplode.push(bombEntityId);
    }
  }

  processExplosions(state, bombIdsToExplode);
}

function placeQueuedBombs(state: BombermanSimulationState): void {
  for (const playerEntityId of getPlayerEntityIds(state)) {
    const player = state.world.getComponent(playerEntityId, 'player');
    const position = state.world.getComponent(playerEntityId, 'position');
    if (!player || !position || !player.alive || !player.queuedBombPlacement) {
      continue;
    }

    player.queuedBombPlacement = false;

    if (player.activeBombCount >= PLAYER_BOMB_LIMIT) {
      continue;
    }

    if (getBombEntitiesAt(state, position.x, position.y).length > 0) {
      continue;
    }

    const bombEntityId = state.world.createEntity();
    state.world.addComponent(bombEntityId, 'position', {
      x: position.x,
      y: position.y,
    });
    state.world.addComponent(bombEntityId, 'bomb', {
      ownerPlayerId: player.playerId,
      fuseTicksRemaining: BOMB_FUSE_TICKS,
      radius: BOMB_BLAST_RADIUS,
      ownerCanPass: true,
    });

    player.activeBombCount += 1;

    pushBombermanEvent(state, {
      kind: 'bomb.placed',
      playerId: player.playerId,
      x: position.x,
      y: position.y,
      fuseTicksRemaining: BOMB_FUSE_TICKS,
      radius: BOMB_BLAST_RADIUS,
    });
  }
}

function updateOwnerPassThrough(state: BombermanSimulationState): void {
  for (const bombEntityId of getBombEntityIds(state)) {
    const bomb = state.world.getComponent(bombEntityId, 'bomb');
    const bombPosition = state.world.getComponent(bombEntityId, 'position');
    if (!bomb || !bombPosition || !bomb.ownerCanPass) {
      continue;
    }

    const ownerEntityId = state.playerEntityIdsByPlayerId.get(bomb.ownerPlayerId);
    if (!ownerEntityId) {
      bomb.ownerCanPass = false;
      continue;
    }

    const ownerPosition = state.world.getComponent(ownerEntityId, 'position');
    if (!ownerPosition || ownerPosition.x !== bombPosition.x || ownerPosition.y !== bombPosition.y) {
      bomb.ownerCanPass = false;
    }
  }
}

function processExplosions(state: BombermanSimulationState, initialQueue: EntityId[]): void {
  const queue = [...initialQueue];
  const processed = new Set<EntityId>();

  while (queue.length > 0) {
    const bombEntityId = queue.shift();
    if (bombEntityId === undefined || processed.has(bombEntityId)) {
      continue;
    }

    const bomb = state.world.getComponent(bombEntityId, 'bomb');
    const position = state.world.getComponent(bombEntityId, 'position');
    if (!bomb || !position) {
      processed.add(bombEntityId);
      continue;
    }

    processed.add(bombEntityId);

    const affectedTiles = computeExplosionTiles(state, position.x, position.y, bomb.radius);

    pushBombermanEvent(state, {
      kind: 'bomb.exploded',
      ownerPlayerId: bomb.ownerPlayerId,
      x: position.x,
      y: position.y,
      affectedTiles,
    });

    state.world.destroyEntity(bombEntityId);
    decrementOwnerBombCount(state, bomb.ownerPlayerId);

    for (const tile of affectedTiles) {
      const softBlockEntityId = getSoftBlockEntityAt(state, tile.x, tile.y);
      if (softBlockEntityId !== undefined) {
        state.world.destroyEntity(softBlockEntityId);
        pushBombermanEvent(state, {
          kind: 'block.destroyed',
          x: tile.x,
          y: tile.y,
        });
      }

      addOrRefreshFlame(state, tile.x, tile.y, bomb.ownerPlayerId);

      const chainBombs = getBombEntitiesAt(state, tile.x, tile.y)
        .map((record) => record.entityId)
        .filter((entityId) => entityId !== bombEntityId && !processed.has(entityId));

      for (const chainBombEntityId of chainBombs) {
        queue.push(chainBombEntityId);
      }
    }
  }
}

function computeExplosionTiles(
  state: BombermanSimulationState,
  originX: number,
  originY: number,
  radius: number,
): TilePosition[] {
  const tiles: TilePosition[] = [{ x: originX, y: originY }];

  for (const direction of Object.values(DIRECTION_VECTORS)) {
    for (let step = 1; step <= radius; step += 1) {
      const x = originX + direction.dx * step;
      const y = originY + direction.dy * step;

      if (!isInsideMap(x, y) || isHardWall(state, x, y)) {
        break;
      }

      tiles.push({ x, y });

      if (getSoftBlockEntityAt(state, x, y) !== undefined) {
        break;
      }
    }
  }

  const deduped = new Map<string, TilePosition>();
  for (const tile of tiles) {
    deduped.set(toTileKey(tile.x, tile.y), tile);
  }

  return [...deduped.values()].sort((a, b) => {
    if (a.y === b.y) {
      return a.x - b.x;
    }

    return a.y - b.y;
  });
}

function decrementOwnerBombCount(state: BombermanSimulationState, ownerPlayerId: string): void {
  const ownerEntityId = state.playerEntityIdsByPlayerId.get(ownerPlayerId);
  if (!ownerEntityId) {
    return;
  }

  const owner = state.world.getComponent(ownerEntityId, 'player');
  if (!owner) {
    return;
  }

  owner.activeBombCount = Math.max(0, owner.activeBombCount - 1);
}

function addOrRefreshFlame(
  state: BombermanSimulationState,
  x: number,
  y: number,
  sourceOwnerPlayerId: string,
): void {
  const existingFlameEntityIds = state.world
    .query(['flame', 'position'])
    .filter((entityId) => {
      const position = state.world.getComponent(entityId, 'position');
      return position?.x === x && position.y === y;
    })
    .sort((a, b) => a - b);

  const primary = existingFlameEntityIds.at(0);
  if (primary !== undefined) {
    const flame = state.world.getComponent(primary, 'flame');
    if (!flame) {
      return;
    }

    flame.ticksRemaining = Math.max(flame.ticksRemaining, FLAME_TICKS);
    if (flame.sourceOwnerPlayerId === null || sourceOwnerPlayerId.localeCompare(flame.sourceOwnerPlayerId) < 0) {
      flame.sourceOwnerPlayerId = sourceOwnerPlayerId;
    }

    for (const duplicate of existingFlameEntityIds.slice(1)) {
      state.world.destroyEntity(duplicate);
    }

    return;
  }

  const flameEntityId = state.world.createEntity();
  state.world.addComponent(flameEntityId, 'position', { x, y });
  state.world.addComponent(flameEntityId, 'flame', {
    ticksRemaining: FLAME_TICKS,
    sourceOwnerPlayerId,
  });
}
