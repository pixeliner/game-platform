import type { BombermanSnapshot } from '@game-platform/game-bomberman';

import type { BombermanSpriteKey } from './sprite-atlas';
import { BOMBERMAN_TILE_SIZE } from './sprite-atlas';

export type RenderLayer =
  | 'floor'
  | 'hardWalls'
  | 'softBlocks'
  | 'bombs'
  | 'flames'
  | 'players'
  | 'overlay';

export interface BombermanDrawInstruction {
  id: string;
  layer: RenderLayer;
  spriteKey: BombermanSpriteKey;
  x: number;
  y: number;
  flipX: boolean;
}

export interface BombermanRenderModel {
  width: number;
  height: number;
  tileSize: number;
  phase: BombermanSnapshot['phase'];
  winnerPlayerId: string | null;
  draws: BombermanDrawInstruction[];
}

function compareDrawOrder(a: BombermanDrawInstruction, b: BombermanDrawInstruction): number {
  const layerOrder: Record<RenderLayer, number> = {
    floor: 0,
    hardWalls: 1,
    softBlocks: 2,
    bombs: 3,
    flames: 4,
    players: 5,
    overlay: 6,
  };

  if (layerOrder[a.layer] !== layerOrder[b.layer]) {
    return layerOrder[a.layer] - layerOrder[b.layer];
  }

  if (a.y === b.y) {
    return a.x - b.x;
  }

  return a.y - b.y;
}

function pickPlayerSprite(playerId: string, alive: boolean): BombermanSpriteKey {
  const isBlue = playerId.localeCompare('m') < 0;

  if (!alive) {
    return isBlue ? 'player.blue.dead' : 'player.red.dead';
  }

  return isBlue ? 'player.blue.idle' : 'player.red.idle';
}

function pickFlameSprite(flameTiles: ReadonlySet<string>, x: number, y: number): BombermanSpriteKey {
  const hasLeft = flameTiles.has(`${x - 1},${y}`);
  const hasRight = flameTiles.has(`${x + 1},${y}`);
  const hasUp = flameTiles.has(`${x},${y - 1}`);
  const hasDown = flameTiles.has(`${x},${y + 1}`);

  if ((hasLeft || hasRight) && !(hasUp || hasDown)) {
    return 'flame.horizontal';
  }

  if ((hasUp || hasDown) && !(hasLeft || hasRight)) {
    return 'flame.vertical';
  }

  return 'flame.center';
}

export function buildBombermanRenderModel(snapshot: BombermanSnapshot): BombermanRenderModel {
  const draws: BombermanDrawInstruction[] = [];
  const flameTiles = new Set(snapshot.flames.map((flame) => `${flame.x},${flame.y}`));

  for (let y = 0; y < snapshot.height; y += 1) {
    for (let x = 0; x < snapshot.width; x += 1) {
      draws.push({
        id: `floor-${x}-${y}`,
        layer: 'floor',
        spriteKey: 'tile.floor',
        x,
        y,
        flipX: false,
      });
    }
  }

  for (const hardWall of snapshot.hardWalls) {
    draws.push({
      id: `hard-${hardWall.x}-${hardWall.y}`,
      layer: 'hardWalls',
      spriteKey: 'tile.wall.hard',
      x: hardWall.x,
      y: hardWall.y,
      flipX: false,
    });
  }

  for (const softBlock of snapshot.softBlocks) {
    draws.push({
      id: `soft-${softBlock.x}-${softBlock.y}`,
      layer: 'softBlocks',
      spriteKey: 'tile.wall.soft',
      x: softBlock.x,
      y: softBlock.y,
      flipX: false,
    });
  }

  for (const bomb of snapshot.bombs) {
    draws.push({
      id: `bomb-${bomb.ownerPlayerId}-${bomb.x}-${bomb.y}`,
      layer: 'bombs',
      spriteKey: 'bomb.idle',
      x: bomb.x,
      y: bomb.y,
      flipX: false,
    });
  }

  for (const flame of snapshot.flames) {
    draws.push({
      id: `flame-${flame.x}-${flame.y}`,
      layer: 'flames',
      spriteKey: pickFlameSprite(flameTiles, flame.x, flame.y),
      x: flame.x,
      y: flame.y,
      flipX: false,
    });
  }

  for (const player of snapshot.players) {
    draws.push({
      id: `player-${player.playerId}`,
      layer: 'players',
      spriteKey: pickPlayerSprite(player.playerId, player.alive),
      x: player.x,
      y: player.y,
      flipX: player.direction === 'left',
    });
  }

  draws.sort(compareDrawOrder);

  return {
    width: snapshot.width,
    height: snapshot.height,
    tileSize: BOMBERMAN_TILE_SIZE,
    phase: snapshot.phase,
    winnerPlayerId: snapshot.winnerPlayerId,
    draws,
  };
}
