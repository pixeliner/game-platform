export const BOMBERMAN_SPRITE_SHEET_PATH = '/assets/games/bomberman/bomberman.png' as const;

export const BOMBERMAN_TILE_SIZE = 36 as const;

export type BombermanSpriteKey =
  | 'tile.floor'
  | 'tile.wall.hard'
  | 'tile.wall.soft.brick'
  | 'tile.wall.soft.crate'
  | 'tile.wall.soft.barrel'
  | 'powerup.bomb_up'
  | 'powerup.blast_up'
  | 'powerup.speed_up'
  | 'powerup.remote_detonator'
  | 'powerup.kick_bombs'
  | 'powerup.throw_bombs'
  | 'bomb.frame.1'
  | 'bomb.frame.2'
  | 'bomb.frame.3'
  | 'flame.center'
  | 'flame.horizontal'
  | 'flame.vertical'
  | 'flame.horizontal.end'
  | 'flame.vertical.end'
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
  'tile.wall.soft.brick': frame(57, 254),
  'tile.wall.soft.crate': frame(99, 254),
  'tile.wall.soft.barrel': frame(259, 209),

  // Powerups.
  'powerup.bomb_up': frame(6, 299),
  'powerup.blast_up': frame(40, 299),
  'powerup.speed_up': frame(74, 299),
  'powerup.remote_detonator': frame(53, 431),
  'powerup.kick_bombs': frame(95, 431),
  'powerup.throw_bombs': frame(138, 431),

  // Core effects.
  'bomb.frame.1': frame(6, 135),
  'bomb.frame.2': frame(40, 135),
  'bomb.frame.3': frame(77, 135),
  'flame.center': frame(10, 171),
  'flame.horizontal': frame(90, 171),
  'flame.vertical': frame(57, 210),
  'flame.horizontal.end': frame(130, 171),
  'flame.vertical.end': frame(16, 210),

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
