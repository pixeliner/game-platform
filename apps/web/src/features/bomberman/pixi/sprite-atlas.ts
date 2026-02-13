export const BOMBERMAN_SPRITE_SHEET_PATH = '/assets/games/bomberman/bomberman.png' as const;

export const BOMBERMAN_TILE_SIZE = 16 as const;

export type BombermanSpriteKey =
  | 'tile.floor'
  | 'tile.wall.hard'
  | 'tile.wall.soft'
  | 'bomb.idle'
  | 'flame.center'
  | 'flame.horizontal'
  | 'flame.vertical'
  | 'player.blue.idle'
  | 'player.red.idle'
  | 'player.blue.dead'
  | 'player.red.dead';

export interface SpriteFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const BOMBERMAN_SPRITE_FRAMES: Readonly<Record<BombermanSpriteKey, SpriteFrame>> = {
  'tile.floor': { x: 96, y: 64, width: 16, height: 16 },
  'tile.wall.hard': { x: 0, y: 64, width: 16, height: 16 },
  'tile.wall.soft': { x: 16, y: 64, width: 16, height: 16 },
  'bomb.idle': { x: 0, y: 48, width: 16, height: 16 },
  'flame.center': { x: 16, y: 48, width: 16, height: 16 },
  'flame.horizontal': { x: 48, y: 48, width: 16, height: 16 },
  'flame.vertical': { x: 32, y: 48, width: 16, height: 16 },
  'player.blue.idle': { x: 0, y: 0, width: 16, height: 16 },
  'player.red.idle': { x: 0, y: 112, width: 16, height: 16 },
  'player.blue.dead': { x: 96, y: 0, width: 16, height: 16 },
  'player.red.dead': { x: 48, y: 112, width: 16, height: 16 },
};
