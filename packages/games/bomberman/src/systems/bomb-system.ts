import type { EntityId } from '@game-platform/engine';

import {
  BOMB_FUSE_TICKS,
  BOMB_THROW_RANGE_TILES,
  DIRECTION_VECTORS,
  FLAME_TICKS,
  toTileKey,
} from '../constants.js';
import { rollPowerupDrop } from '../balance.js';
import { pushBombermanEvent } from '../events.js';
import {
  directionToDelta,
  getBombEntitiesAt,
  getBombEntityIds,
  getFlameOwnersAt,
  getPlayerEntityIds,
  getPowerupEntityAt,
  getSoftBlockEntityAt,
  isHardWall,
  isInsideMap,
  isTileOpenForBombMovement,
  setPendingPowerupDrop,
} from '../state/helpers.js';
import type { BombermanSimulationState } from '../state/setup-world.js';
import type { TilePosition } from '../types.js';

export function runBombSystem(state: BombermanSimulationState): void {
  const initialExplosions: EntityId[] = [];

  placeQueuedBombs(state);
  processThrowRequests(state);
  processRemoteDetonationRequests(state, initialExplosions);
  updateOwnerPassThrough(state);

  for (const bombEntityId of getBombEntityIds(state)) {
    const bomb = state.world.getComponent(bombEntityId, 'bomb');
    const position = state.world.getComponent(bombEntityId, 'position');
    if (!bomb || !position) {
      continue;
    }

    bomb.fuseTicksRemaining -= 1;
    if (bomb.fuseTicksRemaining <= 0) {
      initialExplosions.push(bombEntityId);
      continue;
    }

    if (getFlameOwnersAt(state, position.x, position.y).length > 0) {
      initialExplosions.push(bombEntityId);
    }
  }

  processExplosions(state, initialExplosions);
}

function placeQueuedBombs(state: BombermanSimulationState): void {
  for (const playerEntityId of getPlayerEntityIds(state)) {
    const player = state.world.getComponent(playerEntityId, 'player');
    const position = state.world.getComponent(playerEntityId, 'position');
    if (!player || !position || !player.alive || !player.queuedBombPlacement) {
      continue;
    }

    player.queuedBombPlacement = false;

    if (player.activeBombCount >= player.bombLimit) {
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
      radius: player.blastRadius,
      ownerCanPass: true,
      placedAtTick: state.tick,
      movingDirection: null,
      moveCooldownTicks: 0,
    });

    player.activeBombCount += 1;

    pushBombermanEvent(state, {
      kind: 'bomb.placed',
      playerId: player.playerId,
      x: position.x,
      y: position.y,
      fuseTicksRemaining: BOMB_FUSE_TICKS,
      radius: player.blastRadius,
    });
  }
}

function processThrowRequests(state: BombermanSimulationState): void {
  for (const playerEntityId of getPlayerEntityIds(state)) {
    const player = state.world.getComponent(playerEntityId, 'player');
    const position = state.world.getComponent(playerEntityId, 'position');
    if (!player || !position || !player.alive || !player.queuedBombThrow) {
      continue;
    }

    player.queuedBombThrow = false;

    if (!player.canThrowBombs) {
      continue;
    }

    const direction = player.desiredDirection ?? player.lastFacingDirection;
    const delta = directionToDelta(direction);

    const sameTileBomb = getBombEntitiesAt(state, position.x, position.y)
      .find((record) => record.movingDirection === null);
    const frontBomb = sameTileBomb
      ? undefined
      : getBombEntitiesAt(state, position.x + delta.dx, position.y + delta.dy)
          .find((record) => record.movingDirection === null);
    const bombRecord = sameTileBomb ?? frontBomb;

    if (!bombRecord) {
      continue;
    }

    const bomb = state.world.getComponent(bombRecord.entityId, 'bomb');
    const bombPosition = state.world.getComponent(bombRecord.entityId, 'position');
    if (!bomb || !bombPosition) {
      continue;
    }

    let landingX = bombPosition.x;
    let landingY = bombPosition.y;

    for (let step = 1; step <= BOMB_THROW_RANGE_TILES; step += 1) {
      const nextX = bombPosition.x + delta.dx * step;
      const nextY = bombPosition.y + delta.dy * step;

      if (!isTileOpenForBombMovement(state, nextX, nextY, bombRecord.entityId)) {
        break;
      }

      landingX = nextX;
      landingY = nextY;
    }

    if (landingX === bombPosition.x && landingY === bombPosition.y) {
      continue;
    }

    const fromX = bombPosition.x;
    const fromY = bombPosition.y;

    bombPosition.x = landingX;
    bombPosition.y = landingY;
    bomb.movingDirection = null;
    bomb.moveCooldownTicks = 0;
    bomb.ownerCanPass = false;

    pushBombermanEvent(state, {
      kind: 'bomb.thrown',
      byPlayerId: player.playerId,
      ownerPlayerId: bomb.ownerPlayerId,
      from: { x: fromX, y: fromY },
      to: { x: landingX, y: landingY },
      direction,
    });
  }
}

function processRemoteDetonationRequests(state: BombermanSimulationState, queue: EntityId[]): void {
  for (const playerEntityId of getPlayerEntityIds(state)) {
    const player = state.world.getComponent(playerEntityId, 'player');
    if (!player || !player.alive || !player.queuedRemoteDetonation) {
      continue;
    }

    player.queuedRemoteDetonation = false;

    if (!player.hasRemoteDetonator) {
      continue;
    }

    const targetBomb = getBombEntityIds(state)
      .map((bombEntityId) => {
        const bomb = state.world.getComponent(bombEntityId, 'bomb');
        const position = state.world.getComponent(bombEntityId, 'position');
        if (!bomb || !position || bomb.ownerPlayerId !== player.playerId) {
          return undefined;
        }

        return {
          bombEntityId,
          placedAtTick: bomb.placedAtTick,
          x: position.x,
          y: position.y,
        };
      })
      .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== undefined)
      .sort((a, b) => {
        if (a.placedAtTick !== b.placedAtTick) {
          return a.placedAtTick - b.placedAtTick;
        }

        return a.bombEntityId - b.bombEntityId;
      })
      .at(0);

    if (!targetBomb) {
      continue;
    }

    queue.push(targetBomb.bombEntityId);

    pushBombermanEvent(state, {
      kind: 'bomb.remote_detonated',
      playerId: player.playerId,
      x: targetBomb.x,
      y: targetBomb.y,
    });
  }
}

function updateOwnerPassThrough(state: BombermanSimulationState): void {
  for (const bombEntityId of getBombEntityIds(state)) {
    const bomb = state.world.getComponent(bombEntityId, 'bomb');
    const bombPosition = state.world.getComponent(bombEntityId, 'position');
    if (!bomb || !bombPosition || !bomb.ownerCanPass || bomb.movingDirection !== null) {
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
        const block = state.world.getComponent(softBlockEntityId, 'destructible');
        const blockKind = block?.kind ?? 'brick';

        state.world.destroyEntity(softBlockEntityId);

        const droppedPowerupKind = rollPowerupDrop(state.random, blockKind);

        pushBombermanEvent(state, {
          kind: 'block.destroyed',
          x: tile.x,
          y: tile.y,
          blockKind,
          droppedPowerupKind,
        });

        if (droppedPowerupKind !== null) {
          setPendingPowerupDrop(state, tile.x, tile.y, droppedPowerupKind);
        }
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
  const existingPowerup = getPowerupEntityAt(state, x, y);
  if (existingPowerup !== undefined) {
    state.world.destroyEntity(existingPowerup);
  }

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
