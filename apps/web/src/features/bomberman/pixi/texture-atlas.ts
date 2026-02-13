import { Assets, Rectangle, Texture } from 'pixi.js';

import {
  BOMBERMAN_SPRITE_FRAMES,
  BOMBERMAN_SPRITE_SHEET_PATH,
  type BombermanSpriteKey,
  type SpriteFrame,
} from './sprite-atlas';

export type BombermanTextureAtlas = Readonly<Record<BombermanSpriteKey, Texture>>;

const atlasCache = new Map<string, Promise<BombermanTextureAtlas>>();

function buildTextureFromFrame(sourceTexture: Texture, frame: SpriteFrame): Texture {
  return new Texture({
    source: sourceTexture.source,
    frame: new Rectangle(frame.x, frame.y, frame.width, frame.height),
  });
}

async function loadAtlasSourceTexture(atlasPath: string): Promise<Texture> {
  const loaded = await Assets.load(atlasPath);
  if (loaded instanceof Texture) {
    return loaded;
  }

  return Texture.from(loaded as Parameters<typeof Texture.from>[0]);
}

export function getBombermanTextureAtlas(
  atlasPath: string = BOMBERMAN_SPRITE_SHEET_PATH,
): Promise<BombermanTextureAtlas> {
  const cached = atlasCache.get(atlasPath);
  if (cached) {
    return cached;
  }

  const atlasPromise = loadAtlasSourceTexture(atlasPath).then((sourceTexture) => {
    return Object.fromEntries(
      (Object.entries(BOMBERMAN_SPRITE_FRAMES) as [BombermanSpriteKey, SpriteFrame][]).map(
        ([spriteKey, frame]) => [spriteKey, buildTextureFromFrame(sourceTexture, frame)],
      ),
    ) as Record<BombermanSpriteKey, Texture>;
  });

  atlasCache.set(atlasPath, atlasPromise);
  return atlasPromise;
}
