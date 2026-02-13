import { describe, expect, it } from 'vitest';

import {
  RECONNECT_DELAYS_MS,
  getReconnectDecision,
} from '../reconnect-policy';

describe('reconnect-policy', () => {
  it('returns expected backoff sequence', () => {
    const delays = RECONNECT_DELAYS_MS.map((_, index) => getReconnectDecision(index).delayMs);
    expect(delays).toEqual([500, 1_000, 2_000, 4_000, 8_000]);
  });

  it('returns terminal decision after max attempts', () => {
    const decision = getReconnectDecision(RECONNECT_DELAYS_MS.length);
    expect(decision.shouldRetry).toBe(false);
    expect(decision.delayMs).toBeNull();
  });
});
