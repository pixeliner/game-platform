import type { BombermanSnapshot } from '@game-platform/game-bomberman';
import { Container, Sprite, Texture } from 'pixi.js';

import { buildBombermanRenderModel, type RenderLayer } from './render-model.js';
import { BOMBERMAN_SPRITE_SHEET_PATH, BOMBERMAN_TILE_SIZE } from './sprite-atlas.js';

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

const LAYER_ORDER: RenderLayer[] = ['ground', 'blocks', 'bombs', 'flames', 'players', 'overlay'];

const LAYER_COLORS: Record<RenderLayer, number> = {
  ground: 0x3a3a3a,
  blocks: 0xc08f5b,
  bombs: 0x111111,
  flames: 0xffb347,
  players: 0x88c7ff,
  overlay: 0xffffff,
};

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

export function createPixiBombermanScene(options: CreatePixiBombermanSceneOptions = {}): PixiBombermanScene {
  const atlasPath = options.atlasPath ?? BOMBERMAN_SPRITE_SHEET_PATH;
  const tileSize = options.tileSize ?? BOMBERMAN_TILE_SIZE;

  const root = new Container();
  root.label = 'bomberman-scene-root';

  const layers = createLayerContainers(root);

  return {
    root,
    atlasPath,

    update(snapshot: BombermanSnapshot): void {
      const model = buildBombermanRenderModel(snapshot);
      const drawTileSize = model.tileSize || tileSize;

      for (const layer of LAYER_ORDER) {
        for (const child of layers[layer].removeChildren()) {
          child.destroy();
        }
      }

      for (const draw of model.draws) {
        const sprite = new Sprite(Texture.WHITE);
        sprite.label = draw.id;
        sprite.tint = LAYER_COLORS[draw.layer];
        sprite.width = drawTileSize;
        sprite.height = drawTileSize;
        sprite.x = draw.x * drawTileSize;
        sprite.y = draw.y * drawTileSize;
        sprite.scale.x = draw.flipX ? -1 : 1;
        if (draw.flipX) {
          sprite.x += drawTileSize;
        }

        layers[draw.layer].addChild(sprite);
      }
    },

    destroy(): void {
      root.destroy({
        children: true,
      });
    },
  };
}
