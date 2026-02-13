import { randomUUID } from 'node:crypto';

import type { IdGenerator } from '../types.js';

export function createIdGenerator(): IdGenerator {
  return {
    next(prefix: string): string {
      return `${prefix}_${randomUUID().replace(/-/g, '')}`;
    },
  };
}
