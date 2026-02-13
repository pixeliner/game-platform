import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const protocolEntry = fileURLToPath(new URL('../../packages/protocol/src/index.ts', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@game-platform/protocol': protocolEntry,
    },
  },
  test: {
    include: ['src/__tests__/**/*.test.ts'],
    environment: 'node',
  },
});
