import type {
  GameEventEnvelope,
  GameInstance,
  GameModule,
  InputValidationResult,
} from '@game-platform/engine';

export interface BombermanStubConfig {
  playerIds: string[];
}

export type BombermanStubInput =
  | {
      kind: 'move';
      direction: 'up' | 'down' | 'left' | 'right';
    }
  | {
      kind: 'bomb.place';
    };

export interface BombermanStubPlayerState {
  playerId: string;
  lastInput: string | null;
}

export interface BombermanStubSnapshot {
  tick: number;
  players: BombermanStubPlayerState[];
}

export interface BombermanStubEvent {
  kind: 'input.applied';
  playerId: string;
  inputKind: string;
}

export interface BombermanStubResults {
  winnerPlayerId: string | null;
}

export const GAME_ID_BOMBERMAN = 'bomberman' as const;

function validateBombermanStubInput(input: unknown): InputValidationResult<BombermanStubInput> {
  if (typeof input !== 'object' || input === null) {
    return {
      ok: false,
      reason: 'input_must_be_object',
    };
  }

  if (!('kind' in input)) {
    return {
      ok: false,
      reason: 'input_missing_kind',
    };
  }

  const kind = (input as { kind: unknown }).kind;
  if (kind === 'bomb.place') {
    return {
      ok: true,
      value: {
        kind: 'bomb.place',
      },
    };
  }

  if (kind === 'move') {
    const direction = (input as { direction?: unknown }).direction;
    if (direction === 'up' || direction === 'down' || direction === 'left' || direction === 'right') {
      return {
        ok: true,
        value: {
          kind: 'move',
          direction,
        },
      };
    }

    return {
      ok: false,
      reason: 'move_input_missing_direction',
    };
  }

  return {
    ok: false,
    reason: 'unsupported_input_kind',
  };
}

export const bombermanStubModule: GameModule<
  BombermanStubConfig,
  BombermanStubInput,
  BombermanStubSnapshot,
  BombermanStubEvent,
  BombermanStubResults
> = {
  gameId: GAME_ID_BOMBERMAN,

  createGame(config: BombermanStubConfig): GameInstance<
    BombermanStubInput,
    BombermanStubSnapshot,
    BombermanStubEvent,
    BombermanStubResults
  > {
    const playerStates = new Map<string, BombermanStubPlayerState>();
    for (const playerId of config.playerIds) {
      playerStates.set(playerId, {
        playerId,
        lastInput: null,
      });
    }

    let simulationTick = 0;
    let nextEventId = 1;
    const events: Array<GameEventEnvelope<BombermanStubEvent>> = [];

    return {
      applyInput(playerId, input, tick): void {
        const existing = playerStates.get(playerId);
        if (!existing) {
          playerStates.set(playerId, {
            playerId,
            lastInput: input.kind,
          });
        } else {
          existing.lastInput = input.kind;
        }

        events.push({
          eventId: nextEventId,
          tick,
          event: {
            kind: 'input.applied',
            playerId,
            inputKind: input.kind,
          },
        });
        nextEventId += 1;
      },

      tick(): void {
        simulationTick += 1;
      },

      getSnapshot(): BombermanStubSnapshot {
        return {
          tick: simulationTick,
          players: [...playerStates.values()].sort((a, b) => a.playerId.localeCompare(b.playerId)),
        };
      },

      getEventsSince(lastEventId: number): Array<GameEventEnvelope<BombermanStubEvent>> {
        return events.filter((eventEnvelope) => eventEnvelope.eventId > lastEventId);
      },

      isGameOver(): boolean {
        return false;
      },

      getResults(): BombermanStubResults {
        return {
          winnerPlayerId: null,
        };
      },
    };
  },

  validateInput(input: unknown): InputValidationResult<BombermanStubInput> {
    return validateBombermanStubInput(input);
  },
};
