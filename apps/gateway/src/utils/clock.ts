import type { Clock } from '../types.js';

export function createSystemClock(): Clock {
  return {
    nowMs(): number {
      return Date.now();
    },
  };
}
