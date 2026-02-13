import type { BombermanDirection } from '@game-platform/game-bomberman';

export interface KeyEventLike {
  key: string;
  repeat?: boolean;
  preventDefault?: () => void;
}

export interface KeyboardControllerTarget {
  addEventListener(type: 'keydown' | 'keyup', handler: (event: KeyboardEvent) => void): void;
  removeEventListener(type: 'keydown' | 'keyup', handler: (event: KeyboardEvent) => void): void;
}

export interface KeyboardControllerHandlers {
  onMoveIntent: (direction: BombermanDirection | null) => void;
  onBombPlace: () => void;
}

const KEY_TO_DIRECTION: Readonly<Record<string, BombermanDirection>> = {
  arrowup: 'up',
  w: 'up',
  arrowdown: 'down',
  s: 'down',
  arrowleft: 'left',
  a: 'left',
  arrowright: 'right',
  d: 'right',
};

function normalizeKey(key: string): string {
  if (key === ' ') {
    return 'space';
  }

  return key.toLowerCase();
}

export class KeyboardController {
  private readonly pressedDirections = new Set<BombermanDirection>();
  private readonly directionOrder: BombermanDirection[] = [];
  private activeDirection: BombermanDirection | null = null;
  private target: KeyboardControllerTarget | null = null;

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    this.handleKeyDown(event);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.handleKeyUp(event);
  };

  public constructor(private readonly handlers: KeyboardControllerHandlers) {}

  public attach(target: KeyboardControllerTarget): void {
    if (this.target) {
      return;
    }

    this.target = target;
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
  }

  public detach(emitStopIntent = true): void {
    if (this.target) {
      this.target.removeEventListener('keydown', this.onKeyDown);
      this.target.removeEventListener('keyup', this.onKeyUp);
      this.target = null;
    }

    this.pressedDirections.clear();
    this.directionOrder.length = 0;

    if (emitStopIntent && this.activeDirection !== null) {
      this.activeDirection = null;
      this.handlers.onMoveIntent(null);
      return;
    }

    this.activeDirection = null;
  }

  public handleKeyDown(event: KeyEventLike): void {
    const normalizedKey = normalizeKey(event.key);

    if (normalizedKey === 'space') {
      event.preventDefault?.();
      if (!event.repeat) {
        this.handlers.onBombPlace();
      }
      return;
    }

    const direction = KEY_TO_DIRECTION[normalizedKey];
    if (!direction) {
      return;
    }

    event.preventDefault?.();

    if (!this.pressedDirections.has(direction)) {
      this.pressedDirections.add(direction);
      this.directionOrder.push(direction);
    }

    this.emitMoveIntentIfChanged();
  }

  public handleKeyUp(event: KeyEventLike): void {
    const normalizedKey = normalizeKey(event.key);
    const direction = KEY_TO_DIRECTION[normalizedKey];
    if (!direction) {
      return;
    }

    event.preventDefault?.();
    this.pressedDirections.delete(direction);

    for (let index = this.directionOrder.length - 1; index >= 0; index -= 1) {
      if (this.directionOrder[index] === direction) {
        this.directionOrder.splice(index, 1);
      }
    }

    this.emitMoveIntentIfChanged();
  }

  private emitMoveIntentIfChanged(): void {
    let nextDirection: BombermanDirection | null = null;

    for (let index = this.directionOrder.length - 1; index >= 0; index -= 1) {
      const candidate = this.directionOrder[index];
      if (candidate && this.pressedDirections.has(candidate)) {
        nextDirection = candidate;
        break;
      }
    }

    if (this.activeDirection === nextDirection) {
      return;
    }

    this.activeDirection = nextDirection;
    this.handlers.onMoveIntent(nextDirection);
  }
}
