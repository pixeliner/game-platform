import type { BombermanSnapshot } from '@game-platform/game-bomberman';

import type { BombermanSpriteKey } from './sprite-atlas.js';
import { BOMBERMAN_TILE_SIZE } from './sprite-atlas.js';

export type RenderLayer = 'ground' | 'blocks' | 'bombs' | 'flames' | 'players' | 'overlay';

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
    ground: 0,
    blocks: 1,
    bombs: 2,
    flames: 3,
    players: 4,
    overlay: 5,
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

export function buildBombermanRenderModel(snapshot: BombermanSnapshot): BombermanRenderModel {
  const draws: BombermanDrawInstruction[] = [];

  for (const hardWall of snapshot.hardWalls) {
    draws.push({
      id: `hard-${hardWall.x}-${hardWall.y}`,
      layer: 'ground',
      spriteKey: 'tile.wall.hard',
      x: hardWall.x,
      y: hardWall.y,
      flipX: false,
    });
  }

  for (const softBlock of snapshot.softBlocks) {
    draws.push({
      id: `soft-${softBlock.x}-${softBlock.y}`,
      layer: 'blocks',
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
      spriteKey: 'flame.center',
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
