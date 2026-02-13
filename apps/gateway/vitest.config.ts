import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const engineEntry = fileURLToPath(new URL('../../packages/engine/src/index.ts', import.meta.url));
const bombermanEntry = fileURLToPath(new URL('../../packages/games/bomberman/src/index.ts', import.meta.url));
const protocolEntry = fileURLToPath(new URL('../../packages/protocol/src/index.ts', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@game-platform/engine': engineEntry,
      '@game-platform/game-bomberman': bombermanEntry,
      '@game-platform/protocol': protocolEntry,
    },
  },
  test: {
    include: ['src/__tests__/**/*.test.ts'],
    environment: 'node',
  },
});
