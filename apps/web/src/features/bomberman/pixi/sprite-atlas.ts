export const BOMBERMAN_SPRITE_SHEET_PATH = '/assets/games/bomberman/bomberman.png' as const;

export const BOMBERMAN_TILE_SIZE = 36 as const;

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
  | 'player.yellow.idle'
  | 'player.cyan.idle'
  | 'player.blue.dead'
  | 'player.red.dead'
  | 'player.yellow.dead'
  | 'player.cyan.dead';

export interface SpriteFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

function frame(x: number, y: number): SpriteFrame {
  return {
    x,
    y,
    width: BOMBERMAN_TILE_SIZE,
    height: BOMBERMAN_TILE_SIZE,
  };
}

export const BOMBERMAN_SPRITE_FRAMES: Readonly<Record<BombermanSpriteKey, SpriteFrame>> = {
  // Tiles.
  'tile.floor': frame(219, 209),
  'tile.wall.hard': frame(175, 209),
  'tile.wall.soft': frame(57, 254),

  // Core effects.
  'bomb.idle': frame(260, 209),
  'flame.center': frame(50, 171),
  'flame.horizontal': frame(90, 171),
  'flame.vertical': frame(130, 171),

  // Player palettes.
  'player.blue.idle': frame(13, 561),
  'player.red.idle': frame(55, 516),
  'player.yellow.idle': frame(13, 605),
  'player.cyan.idle': frame(13, 340),
  'player.blue.dead': frame(98, 561),
  'player.red.dead': frame(13, 516),
  'player.yellow.dead': frame(98, 605),
  'player.cyan.dead': frame(96, 340),
};
