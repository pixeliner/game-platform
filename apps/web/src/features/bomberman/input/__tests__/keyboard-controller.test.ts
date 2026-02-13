import { describe, expect, it, vi } from 'vitest';

import { KeyboardController } from '../keyboard-controller';

describe('KeyboardController', () => {
  it('emits movement intent on direction changes and emits null when released', () => {
    const onMoveIntent = vi.fn();
    const onBombPlace = vi.fn();

    const controller = new KeyboardController({
      onMoveIntent,
      onBombPlace,
    });

    controller.handleKeyDown({ key: 'ArrowUp' });
    controller.handleKeyDown({ key: 'ArrowRight' });
    controller.handleKeyUp({ key: 'ArrowRight' });
    controller.handleKeyUp({ key: 'ArrowUp' });

    expect(onMoveIntent.mock.calls).toEqual([
      ['up'],
      ['right'],
      ['up'],
      [null],
    ]);
    expect(onBombPlace).not.toHaveBeenCalled();
  });

  it('emits bomb placement once for non-repeat keydown', () => {
    const onMoveIntent = vi.fn();
    const onBombPlace = vi.fn();

    const controller = new KeyboardController({
      onMoveIntent,
      onBombPlace,
    });

    controller.handleKeyDown({ key: ' ', repeat: false });
    controller.handleKeyDown({ key: ' ', repeat: true });
    controller.handleKeyDown({ key: 'Space', repeat: false });

    expect(onBombPlace).toHaveBeenCalledTimes(2);
    expect(onMoveIntent).not.toHaveBeenCalled();
  });
});
