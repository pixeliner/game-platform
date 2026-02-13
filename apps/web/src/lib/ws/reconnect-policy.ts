export const RECONNECT_DELAYS_MS = [500, 1_000, 2_000, 4_000, 8_000] as const;

export interface ReconnectDecision {
  shouldRetry: boolean;
  delayMs: number | null;
  attemptIndex: number;
}

export function getReconnectDecision(attemptIndex: number): ReconnectDecision {
  const delayMs = RECONNECT_DELAYS_MS.at(attemptIndex) ?? null;

  return {
    shouldRetry: delayMs !== null,
    delayMs,
    attemptIndex,
  };
}
