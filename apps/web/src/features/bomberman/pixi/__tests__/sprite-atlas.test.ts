import { describe, expect, it } from 'vitest';

import {
  BOMBERMAN_SPRITE_FRAMES,
  BOMBERMAN_TILE_SIZE,
  type BombermanSpriteKey,
} from '../sprite-atlas';

const REQUIRED_KEYS: readonly BombermanSpriteKey[] = [
  'tile.floor',
  'tile.wall.hard',
  'tile.wall.soft',
  'bomb.idle',
  'flame.center',
  'flame.horizontal',
  'flame.vertical',
  'player.blue.idle',
  'player.red.idle',
  'player.yellow.idle',
  'player.cyan.idle',
  'player.blue.dead',
  'player.red.dead',
  'player.yellow.dead',
  'player.cyan.dead',
];

describe('BOMBERMAN_SPRITE_FRAMES', () => {
  it('contains every required sprite key', () => {
    for (const key of REQUIRED_KEYS) {
      expect(BOMBERMAN_SPRITE_FRAMES[key]).toBeDefined();
    }
  });

  it('keeps every sprite frame at 36x36 tile size', () => {
    for (const frame of Object.values(BOMBERMAN_SPRITE_FRAMES)) {
      expect(frame.width).toBe(BOMBERMAN_TILE_SIZE);
      expect(frame.height).toBe(BOMBERMAN_TILE_SIZE);
    }
  });
});
