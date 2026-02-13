export const ENGINE_RUNTIME_ERROR_CODES = [
  'runtime_already_started',
  'runtime_stopped',
  'invalid_tick_rate',
  'invalid_snapshot_interval',
] as const;

export type EngineRuntimeErrorCode = (typeof ENGINE_RUNTIME_ERROR_CODES)[number];

export class EngineRuntimeError extends Error {
  public readonly code: EngineRuntimeErrorCode;

  public constructor(code: EngineRuntimeErrorCode, message: string) {
    super(message);
    this.name = 'EngineRuntimeError';
    this.code = code;
  }
}
