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
  destroy(): void;
}

const LAYER_ORDER: RenderLayer[] = [
  'floor',
  'hardWalls',
  'softBlocks',
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

export async function createPixiBombermanScene(
  options: CreatePixiBombermanSceneOptions = {},
): Promise<PixiBombermanScene> {
  const atlasPath = options.atlasPath ?? BOMBERMAN_SPRITE_SHEET_PATH;
  const tileSize = options.tileSize ?? BOMBERMAN_TILE_SIZE;
  const atlas = await getBombermanTextureAtlas(atlasPath);

  const root = new Container();
  root.label = 'bomberman-scene-root';

  const layers = createLayerContainers(root);
  const spritesById = new Map<string, { sprite: Sprite; layer: RenderLayer }>();

  return {
    root,
    atlasPath,

    update(snapshot: BombermanSnapshot): void {
      const model = buildBombermanRenderModel(snapshot);
      const drawTileSize = model.tileSize || tileSize;
      const activeDrawIds = new Set<string>();

      for (const draw of model.draws) {
        let pooledSprite = spritesById.get(draw.id);
        if (!pooledSprite) {
          const sprite = new Sprite(atlas[draw.spriteKey]);
          sprite.label = draw.id;
          pooledSprite = {
            sprite,
            layer: draw.layer,
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

        pooledSprite.sprite.width = drawTileSize;
        pooledSprite.sprite.height = drawTileSize;
        pooledSprite.sprite.x = draw.x * drawTileSize;
        pooledSprite.sprite.y = draw.y * drawTileSize;
        pooledSprite.sprite.scale.x = draw.flipX ? -1 : 1;
        pooledSprite.sprite.scale.y = 1;
        if (draw.flipX) {
          pooledSprite.sprite.x += drawTileSize;
        }

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
