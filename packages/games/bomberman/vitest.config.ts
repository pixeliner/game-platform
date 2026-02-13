import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const engineEntry = fileURLToPath(new URL('../../engine/src/index.ts', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@game-platform/engine': engineEntry,
    },
  },
  test: {
    include: ['src/__tests__/**/*.test.ts'],
    environment: 'node',
  },
});
