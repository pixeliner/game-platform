export interface GameEventEnvelope<TEvent> {
  eventId: number;
  tick: number;
  event: TEvent;
}

export type InputValidationResult<TInput> =
  | {
      ok: true;
      value: TInput;
    }
  | {
      ok: false;
      reason: string;
    };

export interface GameInstance<TInput, TSnapshot, TEvent, TResult> {
  applyInput(playerId: string, input: TInput, tick: number): void;
  tick(): void;
  getSnapshot(): TSnapshot;
  getEventsSince(lastEventId: number): GameEventEnvelope<TEvent>[];
  isGameOver(): boolean;
  getResults(): TResult;
}

export interface GameModule<TConfig, TInput, TSnapshot, TEvent, TResult> {
  readonly gameId: string;
  createGame(config: TConfig, seed: number): GameInstance<TInput, TSnapshot, TEvent, TResult>;
  validateInput(input: unknown): InputValidationResult<TInput>;
}
