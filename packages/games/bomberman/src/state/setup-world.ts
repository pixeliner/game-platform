import { EcsWorld, type EntityId, type GameEventEnvelope } from '@game-platform/engine';

import { MAX_PLAYERS, MIN_PLAYERS, MOVE_COOLDOWN_TICKS, PLAYER_SPAWN_POSITIONS } from '../constants.js';
import { generateBombermanMap, type BombermanMapData } from '../map/generate-map.js';
import type {
  BombermanConfig,
  BombermanEvent,
  BombermanMovementModel,
  BombermanPhase,
} from '../types.js';
import type { BombermanComponents, BombermanWorld } from './components.js';

export type RoundOverReason = 'last_player_standing' | 'tick_limit';

export interface BombermanSimulationState {
  world: BombermanWorld;
  map: BombermanMapData;
  tick: number;
  phase: BombermanPhase;
  movementModel: BombermanMovementModel;
  winnerPlayerId: string | null;
  roundOverReason: RoundOverReason | null;
  playerEntityIdsByPlayerId: Map<string, EntityId>;
  events: Array<GameEventEnvelope<BombermanEvent>>;
  nextEventId: number;
}

function resolveMovementModel(movementModel: BombermanConfig['movementModel']): BombermanMovementModel {
  return movementModel === 'true_transit' ? 'true_transit' : 'grid_smooth';
}

function assertConfig(config: BombermanConfig): void {
  const uniquePlayerIds = new Set(config.playerIds);

  if (config.playerIds.length < MIN_PLAYERS) {
    throw new Error(`Bomberman requires at least ${MIN_PLAYERS} players.`);
  }

  if (config.playerIds.length > MAX_PLAYERS) {
    throw new Error(`Bomberman supports at most ${MAX_PLAYERS} players in v1.`);
  }

  if (uniquePlayerIds.size !== config.playerIds.length) {
    throw new Error('Bomberman config playerIds must be unique.');
  }
}

export function createBombermanSimulationState(config: BombermanConfig, seed: number): BombermanSimulationState {
  assertConfig(config);

  const world = new EcsWorld<BombermanComponents>();
  const map = generateBombermanMap(seed, config.playerIds.length);
  const movementModel = resolveMovementModel(config.movementModel);

  for (const softBlock of map.initialSoftBlockPositions) {
    const blockEntityId = world.createEntity();
    world.addComponent(blockEntityId, 'position', {
      x: softBlock.x,
      y: softBlock.y,
    });
    world.addComponent(blockEntityId, 'destructible', {
      destroyedAtTick: null,
    });
  }

  const playerEntityIdsByPlayerId = new Map<string, EntityId>();

  config.playerIds.forEach((playerId, index) => {
    const spawn = PLAYER_SPAWN_POSITIONS[index];
    if (!spawn) {
      throw new Error(`Missing spawn position for index ${index}.`);
    }

    const entityId = world.createEntity();
    world.addComponent(entityId, 'position', {
      x: spawn.x,
      y: spawn.y,
    });
    world.addComponent(entityId, 'player', {
      playerId,
      alive: true,
      desiredDirection: null,
      queuedBombPlacement: false,
      moveCooldownTicks: 0,
      moveTicksPerTile: MOVE_COOLDOWN_TICKS,
      renderX: spawn.x,
      renderY: spawn.y,
      segmentFromX: spawn.x,
      segmentFromY: spawn.y,
      segmentToX: spawn.x,
      segmentToY: spawn.y,
      segmentDurationTicks: MOVE_COOLDOWN_TICKS,
      segmentElapsedTicks: 0,
      segmentActive: false,
      activeBombCount: 0,
      eliminatedAtTick: null,
    });

    playerEntityIdsByPlayerId.set(playerId, entityId);
  });

  return {
    world,
    map,
    tick: 0,
    phase: 'running',
    movementModel,
    winnerPlayerId: null,
    roundOverReason: null,
    playerEntityIdsByPlayerId,
    events: [],
    nextEventId: 1,
  };
}
