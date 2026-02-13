import { describe, expect, it } from 'vitest';

import { EngineRuntimeError } from '../errors.js';
import type {
  GameEventEnvelope,
  GameInstance,
  GameModule,
  InputValidationResult,
} from '../game-module.js';
import { createEngineRoomRuntime } from '../runtime.js';
import type { TickScheduler } from '../scheduler.js';

interface TestInput {
  kind: 'set';
  value: number;
}

interface TestSnapshot {
  ticks: number;
  values: number[];
}

interface TestEvent {
  kind: 'input.applied';
  value: number;
}

interface TestResults {
  finalTicks: number;
}

class ManualScheduler implements TickScheduler {
  private onTick: (() => void) | undefined;
  private running = false;
  public intervalMs: number | undefined;

  public start(intervalMs: number, onTick: () => void): void {
    this.running = true;
    this.intervalMs = intervalMs;
    this.onTick = onTick;
  }

  public stop(): void {
    this.running = false;
  }

  public isRunning(): boolean {
    return this.running;
  }

  public advance(ticks: number): void {
    if (!this.running || !this.onTick) {
      return;
    }

    for (let index = 0; index < ticks; index += 1) {
      if (!this.running || !this.onTick) {
        return;
      }

      this.onTick();
    }
  }
}

function createTestModule(gameOverAfterTicks?: number): GameModule<undefined, TestInput, TestSnapshot, TestEvent, TestResults> {
  return {
    gameId: 'test-game',
    createGame(): GameInstance<TestInput, TestSnapshot, TestEvent, TestResults> {
      let ticks = 0;
      const values: number[] = [];
      let nextEventId = 1;
      const events: GameEventEnvelope<TestEvent>[] = [];

      return {
        applyInput(_playerId, input, tick): void {
          values.push(input.value);
          events.push({
            eventId: nextEventId,
            tick,
            event: {
              kind: 'input.applied',
              value: input.value,
            },
          });
          nextEventId += 1;
        },

        tick(): void {
          ticks += 1;
        },

        getSnapshot(): TestSnapshot {
          return {
            ticks,
            values: [...values],
          };
        },

        getEventsSince(lastEventId: number): GameEventEnvelope<TestEvent>[] {
          return events.filter((event) => event.eventId > lastEventId);
        },

        isGameOver(): boolean {
          return gameOverAfterTicks !== undefined && ticks >= gameOverAfterTicks;
        },

        getResults(): TestResults {
          return {
            finalTicks: ticks,
          };
        },
      };
    },

    validateInput(input: unknown): InputValidationResult<TestInput> {
      if (
        typeof input === 'object' &&
        input !== null &&
        'kind' in input &&
        'value' in input &&
        (input as { kind: unknown }).kind === 'set' &&
        typeof (input as { value: unknown }).value === 'number'
      ) {
        return {
          ok: true,
          value: input as TestInput,
        };
      }

      return {
        ok: false,
        reason: 'invalid_input_shape',
      };
    },
  };
}

describe('createEngineRoomRuntime', () => {
  it('ticks at fixed interval and emits snapshots every 2 ticks', () => {
    const scheduler = new ManualScheduler();
    const snapshotTicks: number[] = [];

    const runtime = createEngineRoomRuntime({
      roomId: 'room-1',
      gameId: 'test-game',
      seed: 1,
      tickRate: 20,
      snapshotEveryTicks: 2,
      config: undefined,
      module: createTestModule(),
      scheduler,
      callbacks: {
        onSnapshot(emission): void {
          snapshotTicks.push(emission.tick);
        },
      },
    });

    runtime.start();
    scheduler.advance(3);

    expect(scheduler.intervalMs).toBe(50);
    expect(runtime.getTick()).toBe(3);
    expect(snapshotTicks).toEqual([2]);
  });

  it('drains input queue in deterministic enqueue order and rejects invalid input', () => {
    const scheduler = new ManualScheduler();
    const invalidInputs: unknown[] = [];
    const emittedEvents: number[] = [];

    const runtime = createEngineRoomRuntime({
      roomId: 'room-1',
      gameId: 'test-game',
      seed: 1,
      tickRate: 20,
      config: undefined,
      module: createTestModule(),
      scheduler,
      callbacks: {
        onInvalidInput(emission): void {
          invalidInputs.push(emission.input);
        },
        onEvent(emission): void {
          emittedEvents.push(emission.event.value);
        },
      },
    });

    runtime.enqueueInput('p1', 1, { kind: 'set', value: 1 });
    runtime.enqueueInput('p1', 1, { kind: 'set', value: 2 });
    runtime.enqueueInput('p1', 1, { kind: 'invalid' });

    runtime.start();
    scheduler.advance(1);

    expect(emittedEvents).toEqual([1, 2]);
    expect(invalidInputs).toEqual([{ kind: 'invalid' }]);
  });

  it('supports pause and resume', () => {
    const scheduler = new ManualScheduler();

    const runtime = createEngineRoomRuntime({
      roomId: 'room-1',
      gameId: 'test-game',
      seed: 1,
      tickRate: 20,
      config: undefined,
      module: createTestModule(),
      scheduler,
    });

    runtime.start();
    scheduler.advance(1);

    runtime.pause();
    scheduler.advance(2);

    runtime.resume();
    scheduler.advance(1);

    expect(runtime.getTick()).toBe(2);
    expect(runtime.isPaused()).toBe(false);
    expect(runtime.isRunning()).toBe(true);
  });

  it('stops on game over and emits stop reason', () => {
    const scheduler = new ManualScheduler();
    let gameOverResult: TestResults | undefined;
    let stopReason: string | undefined;

    const runtime = createEngineRoomRuntime({
      roomId: 'room-1',
      gameId: 'test-game',
      seed: 1,
      tickRate: 20,
      config: undefined,
      module: createTestModule(2),
      scheduler,
      callbacks: {
        onGameOver(emission): void {
          gameOverResult = emission.results;
        },
        onStopped(emission): void {
          stopReason = emission.reason;
        },
      },
    });

    runtime.start();
    scheduler.advance(5);

    expect(gameOverResult).toEqual({ finalTicks: 2 });
    expect(stopReason).toBe('game_over');
    expect(runtime.isRunning()).toBe(false);
  });

  it('throws when enqueueing into stopped runtime', () => {
    const scheduler = new ManualScheduler();

    const runtime = createEngineRoomRuntime({
      roomId: 'room-1',
      gameId: 'test-game',
      seed: 1,
      tickRate: 20,
      config: undefined,
      module: createTestModule(),
      scheduler,
    });

    runtime.start();
    runtime.stop('test');

    expect(() => runtime.enqueueInput('p1', 1, { kind: 'set', value: 1 })).toThrow(EngineRuntimeError);
  });
});
