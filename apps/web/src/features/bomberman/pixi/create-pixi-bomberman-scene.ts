import type { BombermanSnapshot } from '@game-platform/game-bomberman';
import { Container, Sprite } from 'pixi.js';

import { buildBombermanRenderModel, type RenderLayer } from './render-model';
import { BOMBERMAN_SPRITE_SHEET_PATH, BOMBERMAN_TILE_SIZE } from './sprite-atlas';
import { getBombermanTextureAtlas } from './texture-atlas';

export interface CreatePixiBombermanSceneOptions {
  atlasPath?: string;
  tileSize?: number;
}

export interface PixiBombermanScene {
  readonly root: Container;
  readonly atlasPath: string;
  update(snapshot: BombermanSnapshot): void;
  advance(deltaMs: number): void;
  destroy(): void;
}

interface PooledSpriteRecord {
  sprite: Sprite;
  layer: RenderLayer;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  elapsedMs: number;
  durationMs: number;
  flipX: boolean;
  flipY: boolean;
  tileSize: number;
}

const LAYER_ORDER: RenderLayer[] = [
  'floor',
  'hardWalls',
  'softBlocks',
  'powerups',
  'bombs',
  'flames',
  'players',
  'overlay',
];

function createLayerContainers(root: Container): Record<RenderLayer, Container> {
  const containers = {} as Record<RenderLayer, Container>;

  for (const layer of LAYER_ORDER) {
    const container = new Container();
    container.label = `layer:${layer}`;
    root.addChild(container);
    containers[layer] = container;
  }

  return containers;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getInterpolatedValue(start: number, target: number, elapsedMs: number, durationMs: number): number {
  if (durationMs <= 0) {
    return target;
  }

  const progress = clamp(elapsedMs / durationMs, 0, 1);
  return start + (target - start) * progress;
}

function getCurrentSpriteX(record: PooledSpriteRecord): number {
  return getInterpolatedValue(record.startX, record.targetX, record.elapsedMs, record.durationMs);
}

function getCurrentSpriteY(record: PooledSpriteRecord): number {
  return getInterpolatedValue(record.startY, record.targetY, record.elapsedMs, record.durationMs);
}

function applySpriteTransform(record: PooledSpriteRecord): void {
  const currentX = getCurrentSpriteX(record);
  const currentY = getCurrentSpriteY(record);

  record.sprite.scale.x = record.flipX ? -1 : 1;
  record.sprite.scale.y = record.flipY ? -1 : 1;
  record.sprite.x = record.flipX ? currentX + record.tileSize : currentX;
  record.sprite.y = record.flipY ? currentY + record.tileSize : currentY;
}

export function computeSnapshotTransitionMs(tickDelta: number): number {
  if (tickDelta <= 0 || !Number.isFinite(tickDelta)) {
    return 16;
  }

  return clamp(tickDelta * 50, 16, 200);
}

export async function createPixiBombermanScene(
  options: CreatePixiBombermanSceneOptions = {},
): Promise<PixiBombermanScene> {
  const atlasPath = options.atlasPath ?? BOMBERMAN_SPRITE_SHEET_PATH;
  const tileSize = options.tileSize ?? BOMBERMAN_TILE_SIZE;
  const atlas = await getBombermanTextureAtlas(atlasPath);

  const root = new Container();
  root.label = 'bomberman-scene-root';

  const layers = createLayerContainers(root);
  const spritesById = new Map<string, PooledSpriteRecord>();
  let lastSnapshotTick: number | null = null;

  return {
    root,
    atlasPath,

    update(snapshot: BombermanSnapshot): void {
      const model = buildBombermanRenderModel(snapshot);
      const drawTileSize = model.tileSize || tileSize;
      const activeDrawIds = new Set<string>();
      const tickDelta = lastSnapshotTick === null ? 1 : Math.max(1, snapshot.tick - lastSnapshotTick);
      const durationMs = computeSnapshotTransitionMs(tickDelta);
      lastSnapshotTick = snapshot.tick;

      for (const draw of model.draws) {
        let pooledSprite = spritesById.get(draw.id);
        if (!pooledSprite) {
          const sprite = new Sprite(atlas[draw.spriteKey]);
          sprite.label = draw.id;
          const initialX = draw.x * drawTileSize;
          const initialY = draw.y * drawTileSize;
          pooledSprite = {
            sprite,
            layer: draw.layer,
            startX: initialX,
            startY: initialY,
            targetX: initialX,
            targetY: initialY,
            elapsedMs: durationMs,
            durationMs,
            flipX: draw.flipX,
            flipY: draw.flipY,
            tileSize: drawTileSize,
          };
          spritesById.set(draw.id, pooledSprite);
        }

        if (pooledSprite.layer !== draw.layer) {
          layers[pooledSprite.layer].removeChild(pooledSprite.sprite);
          pooledSprite.layer = draw.layer;
        }

        if (pooledSprite.sprite.texture !== atlas[draw.spriteKey]) {
          pooledSprite.sprite.texture = atlas[draw.spriteKey];
        }

        const currentX = getCurrentSpriteX(pooledSprite);
        const currentY = getCurrentSpriteY(pooledSprite);
        const nextTargetX = draw.x * drawTileSize;
        const nextTargetY = draw.y * drawTileSize;
        const moved = pooledSprite.targetX !== nextTargetX || pooledSprite.targetY !== nextTargetY;

        pooledSprite.tileSize = drawTileSize;
        pooledSprite.flipX = draw.flipX;
        pooledSprite.flipY = draw.flipY;
        pooledSprite.startX = currentX;
        pooledSprite.startY = currentY;
        pooledSprite.targetX = nextTargetX;
        pooledSprite.targetY = nextTargetY;
        pooledSprite.durationMs = moved ? durationMs : 0;
        pooledSprite.elapsedMs = 0;

        pooledSprite.sprite.width = drawTileSize;
        pooledSprite.sprite.height = drawTileSize;
        applySpriteTransform(pooledSprite);

        layers[draw.layer].addChild(pooledSprite.sprite);
        activeDrawIds.add(draw.id);
      }

      for (const [drawId, pooledSprite] of spritesById) {
        if (activeDrawIds.has(drawId)) {
          continue;
        }

        layers[pooledSprite.layer].removeChild(pooledSprite.sprite);
        pooledSprite.sprite.destroy();
        spritesById.delete(drawId);
      }
    },

    advance(deltaMs: number): void {
      for (const pooledSprite of spritesById.values()) {
        if (pooledSprite.durationMs > 0) {
          pooledSprite.elapsedMs = Math.min(
            pooledSprite.durationMs,
            pooledSprite.elapsedMs + Math.max(0, deltaMs),
          );
        }

        applySpriteTransform(pooledSprite);
      }
    },

    destroy(): void {
      for (const pooledSprite of spritesById.values()) {
        pooledSprite.sprite.destroy();
      }
      spritesById.clear();

      root.destroy({
        children: true,
      });
    },
  };
}
