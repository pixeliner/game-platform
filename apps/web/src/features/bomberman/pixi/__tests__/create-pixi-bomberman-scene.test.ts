import { describe, expect, it } from 'vitest';

import { computeSnapshotTransitionMs } from '../create-pixi-bomberman-scene';

describe('computeSnapshotTransitionMs', () => {
  it('clamps transition duration between 16ms and 200ms', () => {
    expect(computeSnapshotTransitionMs(0)).toBe(16);
    expect(computeSnapshotTransitionMs(1)).toBe(50);
    expect(computeSnapshotTransitionMs(2)).toBe(100);
    expect(computeSnapshotTransitionMs(20)).toBe(200);
  });
});
