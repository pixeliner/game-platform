import type {
  GameInstance,
  GameModule,
  InputValidationResult,
} from '@game-platform/engine';

import { GAME_ID_BOMBERMAN } from './constants.js';
import { getBombermanEventsSince } from './events.js';
import { buildBombermanSnapshot } from './snapshot.js';
import { createBombermanSimulationState } from './state/setup-world.js';
import { runBombMotionSystem } from './systems/bomb-motion-system.js';
import { runBombSystem } from './systems/bomb-system.js';
import { runEliminationSystem } from './systems/elimination-system.js';
import { runFlameSystem } from './systems/flame-system.js';
import { runMovementSystem } from './systems/movement-system.js';
import { runPowerupSystem } from './systems/powerup-system.js';
import type {
  BombermanConfig,
  BombermanGameResults,
  BombermanInput,
  BombermanResult,
  BombermanSnapshot,
  BombermanEvent,
} from './types.js';

function validateBombermanInput(input: unknown): InputValidationResult<BombermanInput> {
  if (typeof input !== 'object' || input === null || !('kind' in input)) {
    return {
      ok: false,
      reason: 'input_must_include_kind',
    };
  }

  const kind = (input as { kind: unknown }).kind;

  if (kind === 'bomb.place' || kind === 'bomb.remote_detonate' || kind === 'bomb.throw') {
    return {
      ok: true,
      value: {
        kind,
      } as BombermanInput,
    };
  }

  if (kind === 'move.intent') {
    const direction = (input as { direction?: unknown }).direction;
    if (
      direction === null ||
      direction === 'up' ||
      direction === 'down' ||
      direction === 'left' ||
      direction === 'right'
    ) {
      return {
        ok: true,
        value: {
          kind: 'move.intent',
          direction,
        },
      };
    }

    return {
      ok: false,
      reason: 'move_intent_requires_valid_direction_or_null',
    };
  }

  return {
    ok: false,
    reason: 'unsupported_input_kind',
  };
}

function buildGameResults(state: ReturnType<typeof createBombermanSimulationState>): BombermanGameResults {
  const rows = state.world
    .query(['player'])
    .map((entityId) => state.world.getComponent(entityId, 'player'))
    .filter((player): player is NonNullable<typeof player> => player !== undefined)
    .map((player) => ({
      playerId: player.playerId,
      alive: player.alive,
      eliminatedAtTick: player.eliminatedAtTick,
    }))
    .sort((a, b) => {
      if (a.alive !== b.alive) {
        return a.alive ? -1 : 1;
      }

      const aTick = a.eliminatedAtTick ?? Number.MAX_SAFE_INTEGER;
      const bTick = b.eliminatedAtTick ?? Number.MAX_SAFE_INTEGER;
      if (aTick !== bTick) {
        return bTick - aTick;
      }

      return a.playerId.localeCompare(b.playerId);
    });

  const ranked: BombermanResult[] = rows.map((row, index) => {
    const rank = index + 1;
    const score = Math.max(0, rows.length - rank);

    return {
      playerId: row.playerId,
      rank,
      score,
      alive: row.alive,
      eliminatedAtTick: row.eliminatedAtTick,
    };
  });

  return {
    winnerPlayerId: state.winnerPlayerId,
    results: ranked,
  };
}

export const bombermanModule: GameModule<
  BombermanConfig,
  BombermanInput,
  BombermanSnapshot,
  BombermanEvent,
  BombermanResult[]
> = {
  gameId: GAME_ID_BOMBERMAN,

  createGame(config: BombermanConfig, seed: number): GameInstance<
    BombermanInput,
    BombermanSnapshot,
    BombermanEvent,
    BombermanResult[]
  > {
    const state = createBombermanSimulationState(config, seed);

    return {
      applyInput(playerId, input): void {
        const playerEntityId = state.playerEntityIdsByPlayerId.get(playerId);
        if (!playerEntityId) {
          return;
        }

        const player = state.world.getComponent(playerEntityId, 'player');
        if (!player || !player.alive || state.phase === 'finished') {
          return;
        }

        if (input.kind === 'move.intent') {
          player.desiredDirection = input.direction;
          if (input.direction !== null) {
            player.lastFacingDirection = input.direction;
          }
          return;
        }

        if (input.kind === 'bomb.place') {
          player.queuedBombPlacement = true;
          return;
        }

        if (input.kind === 'bomb.remote_detonate') {
          player.queuedRemoteDetonation = true;
          return;
        }

        player.queuedBombThrow = true;
      },

      tick(): void {
        if (state.phase === 'finished') {
          return;
        }

        state.tick += 1;

        runMovementSystem(state);
        runBombMotionSystem(state);
        runBombSystem(state);
        runFlameSystem(state);
        runEliminationSystem(state);
        runPowerupSystem(state);
      },

      getSnapshot(): BombermanSnapshot {
        return buildBombermanSnapshot(state);
      },

      getEventsSince(lastEventId: number) {
        return getBombermanEventsSince(state, lastEventId);
      },

      isGameOver(): boolean {
        return state.phase === 'finished';
      },

      getResults(): BombermanResult[] {
        return buildGameResults(state).results;
      },
    };
  },

  validateInput(input: unknown): InputValidationResult<BombermanInput> {
    return validateBombermanInput(input);
  },
};

export const bombermanStubModule = bombermanModule;
