import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const protocolEntry = fileURLToPath(new URL('../../packages/protocol/src/index.ts', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@game-platform/protocol': protocolEntry,
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['src/test/setup.ts'],
  },
});
