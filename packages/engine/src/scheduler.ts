export interface TickScheduler {
  start(intervalMs: number, onTick: () => void): void;
  stop(): void;
  isRunning(): boolean;
}

interface IntervalSchedulerOptions {
  setIntervalFn?: (handler: () => void, timeout: number) => NodeJS.Timeout;
  clearIntervalFn?: (timeout: NodeJS.Timeout) => void;
}

export function createIntervalScheduler(options: IntervalSchedulerOptions = {}): TickScheduler {
  const setIntervalFn = options.setIntervalFn ?? setInterval;
  const clearIntervalFn = options.clearIntervalFn ?? clearInterval;

  let timer: NodeJS.Timeout | undefined;

  return {
    start(intervalMs: number, onTick: () => void): void {
      if (timer) {
        return;
      }

      timer = setIntervalFn(() => {
        onTick();
      }, intervalMs);
    },

    stop(): void {
      if (!timer) {
        return;
      }

      clearIntervalFn(timer);
      timer = undefined;
    },

    isRunning(): boolean {
      return timer !== undefined;
    },
  };
}
