import { describe, expect, it } from 'vitest';
import type { BombermanSnapshot } from '@game-platform/game-bomberman';

import { buildBombermanRenderModel } from '../render-model';

function createSnapshot(partial?: Partial<BombermanSnapshot>): BombermanSnapshot {
  return {
    tick: 10,
    phase: 'running',
    width: 4,
    height: 3,
    hardWalls: [],
    softBlocks: [],
    players: [],
    bombs: [],
    flames: [],
    winnerPlayerId: null,
    ...partial,
  };
}

describe('buildBombermanRenderModel', () => {
  it('includes floor tiles for the full map and keeps deterministic layer ordering', () => {
    const snapshot = createSnapshot({
      hardWalls: [{ x: 1, y: 1 }],
      softBlocks: [{ x: 2, y: 1 }],
      bombs: [{ ownerPlayerId: 'p1', x: 1, y: 2, fuseTicksRemaining: 20, radius: 2 }],
      players: [{ playerId: 'p1', x: 1, y: 1, alive: true, direction: 'left', activeBombCount: 1 }],
    });

    const model = buildBombermanRenderModel(snapshot);
    const layers = model.draws.map((draw) => draw.layer);
    const order = {
      floor: 0,
      hardWalls: 1,
      softBlocks: 2,
      bombs: 3,
      flames: 4,
      players: 5,
      overlay: 6,
    } as const;

    expect(model.draws.filter((draw) => draw.layer === 'floor')).toHaveLength(
      snapshot.width * snapshot.height,
    );
    expect(layers).toEqual([...layers].sort((a, b) => order[a] - order[b]));
  });

  it('derives flame sprite orientation from neighboring flame tiles', () => {
    const snapshot = createSnapshot({
      flames: [
        { x: 1, y: 1, ticksRemaining: 5, sourceOwnerPlayerId: 'p1' },
        { x: 0, y: 1, ticksRemaining: 5, sourceOwnerPlayerId: 'p1' },
        { x: 2, y: 1, ticksRemaining: 5, sourceOwnerPlayerId: 'p1' },
        { x: 3, y: 2, ticksRemaining: 5, sourceOwnerPlayerId: 'p1' },
        { x: 3, y: 1, ticksRemaining: 5, sourceOwnerPlayerId: 'p1' },
      ],
    });

    const model = buildBombermanRenderModel(snapshot);
    const flameDrawById = new Map(
      model.draws
        .filter((draw) => draw.layer === 'flames')
        .map((draw) => [draw.id, draw.spriteKey]),
    );

    expect(flameDrawById.get('flame-1-1')).toBe('flame.horizontal');
    expect(flameDrawById.get('flame-3-2')).toBe('flame.vertical');
  });

  it('assigns deterministic player palettes by sorted player id and alive state', () => {
    const snapshot = createSnapshot({
      players: [
        { playerId: 'd-player', x: 0, y: 0, alive: false, direction: 'down', activeBombCount: 0 },
        { playerId: 'b-player', x: 1, y: 0, alive: true, direction: 'down', activeBombCount: 0 },
        { playerId: 'a-player', x: 2, y: 0, alive: true, direction: 'down', activeBombCount: 0 },
        { playerId: 'c-player', x: 3, y: 0, alive: true, direction: 'down', activeBombCount: 0 },
      ],
    });

    const model = buildBombermanRenderModel(snapshot);
    const playerDrawById = new Map(
      model.draws
        .filter((draw) => draw.layer === 'players')
        .map((draw) => [draw.id, draw.spriteKey]),
    );

    expect(playerDrawById.get('player-a-player')).toBe('player.blue.idle');
    expect(playerDrawById.get('player-b-player')).toBe('player.red.idle');
    expect(playerDrawById.get('player-c-player')).toBe('player.yellow.idle');
    expect(playerDrawById.get('player-d-player')).toBe('player.cyan.dead');
  });

  it('uses the expected tile sprite keys for floor and walls', () => {
    const snapshot = createSnapshot({
      hardWalls: [{ x: 1, y: 1 }],
      softBlocks: [{ x: 2, y: 1 }],
    });

    const model = buildBombermanRenderModel(snapshot);
    const drawById = new Map(model.draws.map((draw) => [draw.id, draw.spriteKey]));

    expect(drawById.get('floor-0-0')).toBe('tile.floor');
    expect(drawById.get('hard-1-1')).toBe('tile.wall.hard');
    expect(drawById.get('soft-2-1')).toBe('tile.wall.soft');
  });
});
