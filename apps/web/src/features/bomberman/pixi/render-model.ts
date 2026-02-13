import type {
  BombermanPowerupKind,
  BombermanSnapshot,
} from '@game-platform/game-bomberman';

import type { BombermanSpriteKey } from './sprite-atlas';
import { BOMBERMAN_TILE_SIZE } from './sprite-atlas';

export type RenderLayer =
  | 'floor'
  | 'hardWalls'
  | 'softBlocks'
  | 'powerups'
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
  flipY: boolean;
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
    powerups: 3,
    bombs: 4,
    flames: 5,
    players: 6,
    overlay: 7,
  };

  if (layerOrder[a.layer] !== layerOrder[b.layer]) {
    return layerOrder[a.layer] - layerOrder[b.layer];
  }

  if (a.y === b.y) {
    return a.x - b.x;
  }

  return a.y - b.y;
}

type PlayerPalette = 'blue' | 'red' | 'yellow' | 'cyan';
const PLAYER_PALETTE_ORDER: readonly PlayerPalette[] = ['blue', 'red', 'yellow', 'cyan'];

function buildPlayerPaletteById(snapshot: BombermanSnapshot): ReadonlyMap<string, PlayerPalette> {
  const playerIds = [...snapshot.players]
    .map((player) => player.playerId)
    .sort((a, b) => a.localeCompare(b));
  const paletteByPlayerId = new Map<string, PlayerPalette>();

  for (const [index, playerId] of playerIds.entries()) {
    const palette = PLAYER_PALETTE_ORDER[index % PLAYER_PALETTE_ORDER.length] ?? 'blue';
    paletteByPlayerId.set(playerId, palette);
  }

  return paletteByPlayerId;
}

function pickPlayerSprite(palette: PlayerPalette, alive: boolean): BombermanSpriteKey {
  if (alive) {
    switch (palette) {
      case 'blue':
        return 'player.blue.idle';
      case 'red':
        return 'player.red.idle';
      case 'yellow':
        return 'player.yellow.idle';
      case 'cyan':
        return 'player.cyan.idle';
    }
  }

  switch (palette) {
    case 'blue':
      return 'player.blue.dead';
    case 'red':
      return 'player.red.dead';
    case 'yellow':
      return 'player.yellow.dead';
    case 'cyan':
      return 'player.cyan.dead';
  }
}

function pickSoftBlockSprite(kind: BombermanSnapshot['softBlocks'][number]['kind']): BombermanSpriteKey {
  switch (kind) {
    case 'brick':
      return 'tile.wall.soft.brick';
    case 'crate':
      return 'tile.wall.soft.crate';
    case 'barrel':
      return 'tile.wall.soft.barrel';
  }
}

function pickPowerupSprite(kind: BombermanPowerupKind): BombermanSpriteKey {
  switch (kind) {
    case 'bomb_up':
      return 'powerup.bomb_up';
    case 'blast_up':
      return 'powerup.blast_up';
    case 'speed_up':
      return 'powerup.speed_up';
    case 'remote_detonator':
      return 'powerup.remote_detonator';
    case 'kick_bombs':
      return 'powerup.kick_bombs';
    case 'throw_bombs':
      return 'powerup.throw_bombs';
  }
}

function pickBombSprite(fuseTicksRemaining: number): BombermanSpriteKey {
  const sequence: readonly BombermanSpriteKey[] = [
    'bomb.frame.1',
    'bomb.frame.2',
    'bomb.frame.3',
    'bomb.frame.2',
  ];
  const cycleIndex = ((Math.floor(fuseTicksRemaining) - 1) % sequence.length + sequence.length) %
    sequence.length;
  return sequence[cycleIndex] ?? 'bomb.frame.1';
}

interface FlameSpriteSelection {
  spriteKey: BombermanSpriteKey;
  flipX: boolean;
  flipY: boolean;
}

function pickFlameSprite(flameTiles: ReadonlySet<string>, x: number, y: number): FlameSpriteSelection {
  const hasLeft = flameTiles.has(`${x - 1},${y}`);
  const hasRight = flameTiles.has(`${x + 1},${y}`);
  const hasUp = flameTiles.has(`${x},${y - 1}`);
  const hasDown = flameTiles.has(`${x},${y + 1}`);

  const horizontalNeighbors = (hasLeft ? 1 : 0) + (hasRight ? 1 : 0);
  const verticalNeighbors = (hasUp ? 1 : 0) + (hasDown ? 1 : 0);

  if (horizontalNeighbors > 0 && verticalNeighbors > 0) {
    return {
      spriteKey: 'flame.center',
      flipX: false,
      flipY: false,
    };
  }

  if (horizontalNeighbors === 2) {
    return {
      spriteKey: 'flame.horizontal',
      flipX: false,
      flipY: false,
    };
  }

  if (verticalNeighbors === 2) {
    return {
      spriteKey: 'flame.vertical',
      flipX: false,
      flipY: false,
    };
  }

  if (horizontalNeighbors === 1 && verticalNeighbors === 0) {
    return {
      spriteKey: 'flame.horizontal.end',
      flipX: hasRight,
      flipY: false,
    };
  }

  if (verticalNeighbors === 1 && horizontalNeighbors === 0) {
    return {
      spriteKey: 'flame.vertical.end',
      flipX: false,
      flipY: hasDown,
    };
  }

  return {
    spriteKey: 'flame.center',
    flipX: false,
    flipY: false,
  };
}

export function buildBombermanRenderModel(snapshot: BombermanSnapshot): BombermanRenderModel {
  const draws: BombermanDrawInstruction[] = [];
  const flameTiles = new Set(snapshot.flames.map((flame) => `${flame.x},${flame.y}`));
  const playerPaletteById = buildPlayerPaletteById(snapshot);

  for (let y = 0; y < snapshot.height; y += 1) {
    for (let x = 0; x < snapshot.width; x += 1) {
      draws.push({
        id: `floor-${x}-${y}`,
        layer: 'floor',
        spriteKey: 'tile.floor',
        x,
        y,
        flipX: false,
        flipY: false,
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
      flipY: false,
    });
  }

  for (const softBlock of snapshot.softBlocks) {
    draws.push({
      id: `soft-${softBlock.x}-${softBlock.y}`,
      layer: 'softBlocks',
      spriteKey: pickSoftBlockSprite(softBlock.kind),
      x: softBlock.x,
      y: softBlock.y,
      flipX: false,
      flipY: false,
    });
  }

  for (const powerup of snapshot.powerups) {
    draws.push({
      id: `powerup-${powerup.x}-${powerup.y}`,
      layer: 'powerups',
      spriteKey: pickPowerupSprite(powerup.kind),
      x: powerup.x,
      y: powerup.y,
      flipX: false,
      flipY: false,
    });
  }

  for (const bomb of snapshot.bombs) {
    draws.push({
      id: `bomb-${bomb.ownerPlayerId}-${bomb.x}-${bomb.y}`,
      layer: 'bombs',
      spriteKey: pickBombSprite(bomb.fuseTicksRemaining),
      x: bomb.x,
      y: bomb.y,
      flipX: false,
      flipY: false,
    });
  }

  for (const flame of snapshot.flames) {
    const flameSelection = pickFlameSprite(flameTiles, flame.x, flame.y);

    draws.push({
      id: `flame-${flame.x}-${flame.y}`,
      layer: 'flames',
      spriteKey: flameSelection.spriteKey,
      x: flame.x,
      y: flame.y,
      flipX: flameSelection.flipX,
      flipY: flameSelection.flipY,
    });
  }

  for (const player of snapshot.players) {
    const playerPalette = playerPaletteById.get(player.playerId) ?? 'blue';

    draws.push({
      id: `player-${player.playerId}`,
      layer: 'players',
      spriteKey: pickPlayerSprite(playerPalette, player.alive),
      x: player.x,
      y: player.y,
      flipX: player.direction === 'left',
      flipY: false,
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
