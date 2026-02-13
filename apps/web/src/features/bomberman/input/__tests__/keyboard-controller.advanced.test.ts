import { describe, expect, it, vi } from 'vitest';

import { KeyboardController } from '../keyboard-controller';

describe('KeyboardController advanced inputs', () => {
  it('emits remote detonate on E non-repeat', () => {
    const onMoveIntent = vi.fn();
    const onBombPlace = vi.fn();
    const onRemoteDetonate = vi.fn();
    const onBombThrow = vi.fn();

    const controller = new KeyboardController({
      onMoveIntent,
      onBombPlace,
      onRemoteDetonate,
      onBombThrow,
    });

    controller.handleKeyDown({ key: 'e', repeat: false });
    controller.handleKeyDown({ key: 'E', repeat: true });

    expect(onRemoteDetonate).toHaveBeenCalledTimes(1);
    expect(onBombPlace).not.toHaveBeenCalled();
    expect(onBombThrow).not.toHaveBeenCalled();
    expect(onMoveIntent).not.toHaveBeenCalled();
  });

  it('emits throw on Shift+Space and does not emit place for the same keydown', () => {
    const onMoveIntent = vi.fn();
    const onBombPlace = vi.fn();
    const onRemoteDetonate = vi.fn();
    const onBombThrow = vi.fn();

    const controller = new KeyboardController({
      onMoveIntent,
      onBombPlace,
      onRemoteDetonate,
      onBombThrow,
    });

    controller.handleKeyDown({ key: ' ', shiftKey: true, repeat: false });
    controller.handleKeyDown({ key: 'Space', shiftKey: true, repeat: true });

    expect(onBombThrow).toHaveBeenCalledTimes(1);
    expect(onBombPlace).not.toHaveBeenCalled();
    expect(onRemoteDetonate).not.toHaveBeenCalled();
    expect(onMoveIntent).not.toHaveBeenCalled();
  });
});
