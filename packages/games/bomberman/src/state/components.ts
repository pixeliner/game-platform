import type { EcsWorld, EntityId } from '@game-platform/engine';

import type {
  BombermanDestructibleKind,
  BombermanDirection,
  BombermanPowerupKind,
} from '../types.js';

export interface GridPositionComponent {
  x: number;
  y: number;
}

export interface PlayerComponent {
  playerId: string;
  alive: boolean;
  desiredDirection: BombermanDirection | null;
  lastFacingDirection: BombermanDirection;
  queuedBombPlacement: boolean;
  queuedRemoteDetonation: boolean;
  queuedBombThrow: boolean;
  moveCooldownTicks: number;
  moveTicksPerTile: number;
  renderX: number;
  renderY: number;
  segmentFromX: number;
  segmentFromY: number;
  segmentToX: number;
  segmentToY: number;
  segmentDurationTicks: number;
  segmentElapsedTicks: number;
  segmentActive: boolean;
  activeBombCount: number;
  bombLimit: number;
  blastRadius: number;
  speedTier: number;
  hasRemoteDetonator: boolean;
  canKickBombs: boolean;
  canThrowBombs: boolean;
  eliminatedAtTick: number | null;
}

export interface BombComponent {
  ownerPlayerId: string;
  fuseTicksRemaining: number;
  radius: number;
  ownerCanPass: boolean;
  placedAtTick: number;
  movingDirection: BombermanDirection | null;
  moveCooldownTicks: number;
}

export interface FlameComponent {
  ticksRemaining: number;
  sourceOwnerPlayerId: string | null;
}

export interface DestructibleBlockComponent {
  destroyedAtTick: number | null;
  kind: BombermanDestructibleKind;
}

export interface PowerupComponent {
  kind: BombermanPowerupKind;
}

export interface BombermanComponents {
  position: GridPositionComponent;
  player: PlayerComponent;
  bomb: BombComponent;
  flame: FlameComponent;
  destructible: DestructibleBlockComponent;
  powerup: PowerupComponent;
}

export type BombermanWorld = EcsWorld<BombermanComponents>;

export interface BombermanPlayerRecord {
  playerId: string;
  entityId: EntityId;
}
