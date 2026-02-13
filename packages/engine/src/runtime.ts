import { EngineRuntimeError } from './errors.js';
import { type GameModule } from './game-module.js';
import { InputQueue } from './input-queue.js';
import { createIntervalScheduler, type TickScheduler } from './scheduler.js';

export interface SnapshotEmission<TSnapshot> {
  roomId: string;
  gameId: string;
  tick: number;
  snapshot: TSnapshot;
}

export interface EventEmission<TEvent> {
  roomId: string;
  gameId: string;
  eventId: number;
  tick: number;
  event: TEvent;
}

export interface GameOverEmission<TResult> {
  roomId: string;
  gameId: string;
  tick: number;
  results: TResult;
}

export interface InvalidInputEmission {
  roomId: string;
  gameId: string;
  playerId: string;
  tick: number;
  reason: string;
  input: unknown;
}

export interface StoppedEmission {
  roomId: string;
  gameId: string;
  tick: number;
  reason: string;
}

export interface EngineRuntimeCallbacks<TSnapshot, TEvent, TResult> {
  onSnapshot?: (emission: SnapshotEmission<TSnapshot>) => void;
  onEvent?: (emission: EventEmission<TEvent>) => void;
  onGameOver?: (emission: GameOverEmission<TResult>) => void;
  onInvalidInput?: (emission: InvalidInputEmission) => void;
  onStopped?: (emission: StoppedEmission) => void;
}

export interface CreateEngineRoomRuntimeOptions<TConfig, TInput, TSnapshot, TEvent, TResult> {
  roomId: string;
  gameId: string;
  seed: number;
  tickRate: number;
  snapshotEveryTicks?: number;
  config: TConfig;
  module: GameModule<TConfig, TInput, TSnapshot, TEvent, TResult>;
  scheduler?: TickScheduler;
  callbacks?: EngineRuntimeCallbacks<TSnapshot, TEvent, TResult>;
}

export interface EngineRoomRuntime<TSnapshot = unknown> {
  start(): void;
  stop(reason?: string): void;
  pause(): void;
  resume(): void;
  enqueueInput(playerId: string, tick: number, input: unknown): void;
  getTick(): number;
  getLatestSnapshot(): TSnapshot;
  isRunning(): boolean;
  isPaused(): boolean;
}

type RuntimeState = 'idle' | 'running' | 'paused' | 'stopped';

export function createEngineRoomRuntime<TConfig, TInput, TSnapshot, TEvent, TResult>(
  options: CreateEngineRoomRuntimeOptions<TConfig, TInput, TSnapshot, TEvent, TResult>,
): EngineRoomRuntime<TSnapshot> {
  if (!Number.isFinite(options.tickRate) || options.tickRate <= 0) {
    throw new EngineRuntimeError('invalid_tick_rate', `Expected positive tickRate, received ${options.tickRate}`);
  }

  const snapshotEveryTicks = options.snapshotEveryTicks ?? 2;
  if (!Number.isFinite(snapshotEveryTicks) || snapshotEveryTicks <= 0) {
    throw new EngineRuntimeError(
      'invalid_snapshot_interval',
      `Expected positive snapshotEveryTicks, received ${snapshotEveryTicks}`,
    );
  }

  const scheduler = options.scheduler ?? createIntervalScheduler();
  const callbacks = options.callbacks ?? {};
  const gameInstance = options.module.createGame(options.config, options.seed);
  const inputQueue = new InputQueue();

  const tickIntervalMs = Math.max(1, Math.floor(1000 / options.tickRate));

  let state: RuntimeState = 'idle';
  let tick = 0;
  let lastEventId = 0;
  let latestSnapshot = gameInstance.getSnapshot();

  const stopInternal = (reason: string): void => {
    if (state === 'stopped') {
      return;
    }

    scheduler.stop();
    state = 'stopped';

    callbacks.onStopped?.({
      roomId: options.roomId,
      gameId: options.gameId,
      tick,
      reason,
    });
  };

  const onTick = (): void => {
    if (state !== 'running') {
      return;
    }

    tick += 1;

    const readyInputs = inputQueue.drainReady(tick);
    for (const queuedInput of readyInputs) {
      const validation = options.module.validateInput(queuedInput.input);
      if (!validation.ok) {
        callbacks.onInvalidInput?.({
          roomId: options.roomId,
          gameId: options.gameId,
          playerId: queuedInput.playerId,
          tick: queuedInput.tick,
          reason: validation.reason,
          input: queuedInput.input,
        });
        continue;
      }

      gameInstance.applyInput(queuedInput.playerId, validation.value, queuedInput.tick);
    }

    gameInstance.tick();

    const newEvents = gameInstance.getEventsSince(lastEventId);
    for (const eventEnvelope of newEvents) {
      lastEventId = Math.max(lastEventId, eventEnvelope.eventId);
      callbacks.onEvent?.({
        roomId: options.roomId,
        gameId: options.gameId,
        eventId: eventEnvelope.eventId,
        tick: eventEnvelope.tick,
        event: eventEnvelope.event,
      });
    }

    if (tick % snapshotEveryTicks === 0) {
      latestSnapshot = gameInstance.getSnapshot();
      callbacks.onSnapshot?.({
        roomId: options.roomId,
        gameId: options.gameId,
        tick,
        snapshot: latestSnapshot,
      });
    }

    if (gameInstance.isGameOver()) {
      callbacks.onGameOver?.({
        roomId: options.roomId,
        gameId: options.gameId,
        tick,
        results: gameInstance.getResults(),
      });
      stopInternal('game_over');
    }
  };

  return {
    start(): void {
      if (state !== 'idle') {
        throw new EngineRuntimeError('runtime_already_started', 'Runtime can only be started once.');
      }

      state = 'running';
      scheduler.start(tickIntervalMs, onTick);
    },

    stop(reason = 'manual_stop'): void {
      stopInternal(reason);
    },

    pause(): void {
      if (state !== 'running') {
        return;
      }

      scheduler.stop();
      state = 'paused';
    },

    resume(): void {
      if (state !== 'paused') {
        return;
      }

      state = 'running';
      scheduler.start(tickIntervalMs, onTick);
    },

    enqueueInput(playerId: string, inputTick: number, input: unknown): void {
      if (state === 'stopped') {
        throw new EngineRuntimeError('runtime_stopped', 'Cannot enqueue input after runtime has stopped.');
      }

      inputQueue.enqueue(playerId, inputTick, input);
    },

    getTick(): number {
      return tick;
    },

    getLatestSnapshot(): TSnapshot {
      return latestSnapshot;
    },

    isRunning(): boolean {
      return state === 'running';
    },

    isPaused(): boolean {
      return state === 'paused';
    },
  };
}
