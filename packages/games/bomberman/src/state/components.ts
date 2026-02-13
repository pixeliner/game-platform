import type { EcsWorld, EntityId } from '@game-platform/engine';

import type { BombermanDirection } from '../types.js';

export interface GridPositionComponent {
  x: number;
  y: number;
}

export interface PlayerComponent {
  playerId: string;
  alive: boolean;
  desiredDirection: BombermanDirection | null;
  queuedBombPlacement: boolean;
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
  eliminatedAtTick: number | null;
}

export interface BombComponent {
  ownerPlayerId: string;
  fuseTicksRemaining: number;
  radius: number;
  ownerCanPass: boolean;
}

export interface FlameComponent {
  ticksRemaining: number;
  sourceOwnerPlayerId: string | null;
}

export interface DestructibleBlockComponent {
  destroyedAtTick: number | null;
}

export interface BombermanComponents {
  position: GridPositionComponent;
  player: PlayerComponent;
  bomb: BombComponent;
  flame: FlameComponent;
  destructible: DestructibleBlockComponent;
}

export type BombermanWorld = EcsWorld<BombermanComponents>;

export interface BombermanPlayerRecord {
  playerId: string;
  entityId: EntityId;
}
