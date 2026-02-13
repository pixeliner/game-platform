import { describe, expect, it } from 'vitest';

import { loadGatewayConfig } from '../config.js';

describe('loadGatewayConfig', () => {
  it('defaults bomberman movement model to grid_smooth', () => {
    const config = loadGatewayConfig({});
    expect(config.bombermanMovementModel).toBe('grid_smooth');
  });

  it('accepts true_transit bomberman movement model', () => {
    const config = loadGatewayConfig({
      GATEWAY_BOMBERMAN_MOVEMENT_MODEL: 'true_transit',
    });
    expect(config.bombermanMovementModel).toBe('true_transit');
  });

  it('rejects invalid bomberman movement model values', () => {
    expect(() =>
      loadGatewayConfig({
        GATEWAY_BOMBERMAN_MOVEMENT_MODEL: 'fast_mode',
      }),
    ).toThrow('Invalid GATEWAY_BOMBERMAN_MOVEMENT_MODEL');
  });
});
