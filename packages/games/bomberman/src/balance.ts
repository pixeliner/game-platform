import {
  BASE_BOMB_BLAST_RADIUS,
  BASE_MOVE_COOLDOWN_TICKS,
  BASE_PLAYER_BOMB_LIMIT,
  MAX_PLAYER_BLAST_RADIUS,
  MAX_PLAYER_BOMB_LIMIT,
  MAX_PLAYER_SPEED_TIER,
  MIN_MOVE_COOLDOWN_TICKS,
} from './constants.js';
import type { DeterministicRandom } from './random.js';
import type { BombermanDestructibleKind, BombermanPowerupKind } from './types.js';

interface WeightedValue<T> {
  value: T;
  weight: number;
}

export const SOFT_BLOCK_VARIANT_WEIGHTS: ReadonlyArray<WeightedValue<BombermanDestructibleKind>> = [
  { value: 'brick', weight: 60 },
  { value: 'crate', weight: 25 },
  { value: 'barrel', weight: 15 },
];

export const POWERUP_DROP_WEIGHTS: ReadonlyArray<WeightedValue<BombermanPowerupKind>> = [
  { value: 'bomb_up', weight: 30 },
  { value: 'blast_up', weight: 25 },
  { value: 'speed_up', weight: 20 },
  { value: 'remote_detonator', weight: 10 },
  { value: 'kick_bombs', weight: 10 },
  { value: 'throw_bombs', weight: 5 },
];

export const DROP_CHANCE_BY_BLOCK_KIND: Readonly<Record<BombermanDestructibleKind, number>> = {
  brick: 0.3,
  crate: 0.4,
  barrel: 0.5,
};

export interface PlayerDefaults {
  bombLimit: number;
  blastRadius: number;
  speedTier: number;
  hasRemoteDetonator: boolean;
  canKickBombs: boolean;
  canThrowBombs: boolean;
}

export const DEFAULT_PLAYER_ATTRIBUTES: Readonly<PlayerDefaults> = {
  bombLimit: BASE_PLAYER_BOMB_LIMIT,
  blastRadius: BASE_BOMB_BLAST_RADIUS,
  speedTier: 0,
  hasRemoteDetonator: false,
  canKickBombs: false,
  canThrowBombs: false,
};

export function resolveMoveCooldownTicks(speedTier: number): number {
  const normalized = Math.max(0, Math.min(MAX_PLAYER_SPEED_TIER, Math.floor(speedTier)));
  return Math.max(MIN_MOVE_COOLDOWN_TICKS, BASE_MOVE_COOLDOWN_TICKS - normalized);
}

export function pickWeighted<T>(
  random: DeterministicRandom,
  entries: ReadonlyArray<WeightedValue<T>>,
): T {
  const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight <= 0) {
    throw new Error('Weighted selection requires a positive total weight.');
  }

  let roll = random.nextFloat() * totalWeight;
  for (const entry of entries) {
    if (roll < entry.weight) {
      return entry.value;
    }

    roll -= entry.weight;
  }

  const fallback = entries.at(-1);
  if (!fallback) {
    throw new Error('Weighted selection requires at least one entry.');
  }

  return fallback.value;
}

export function rollSoftBlockVariant(random: DeterministicRandom): BombermanDestructibleKind {
  return pickWeighted(random, SOFT_BLOCK_VARIANT_WEIGHTS);
}

export function rollPowerupDrop(
  random: DeterministicRandom,
  blockKind: BombermanDestructibleKind,
): BombermanPowerupKind | null {
  const chance = DROP_CHANCE_BY_BLOCK_KIND[blockKind] ?? 0;
  if (random.nextFloat() > chance) {
    return null;
  }

  return pickWeighted(random, POWERUP_DROP_WEIGHTS);
}

export function applyPowerupToPlayer(
  powerupKind: BombermanPowerupKind,
  current: PlayerDefaults,
): PlayerDefaults {
  switch (powerupKind) {
    case 'bomb_up':
      return {
        ...current,
        bombLimit: Math.min(MAX_PLAYER_BOMB_LIMIT, current.bombLimit + 1),
      };
    case 'blast_up':
      return {
        ...current,
        blastRadius: Math.min(MAX_PLAYER_BLAST_RADIUS, current.blastRadius + 1),
      };
    case 'speed_up':
      return {
        ...current,
        speedTier: Math.min(MAX_PLAYER_SPEED_TIER, current.speedTier + 1),
      };
    case 'remote_detonator':
      return {
        ...current,
        hasRemoteDetonator: true,
      };
    case 'kick_bombs':
      return {
        ...current,
        canKickBombs: true,
      };
    case 'throw_bombs':
      return {
        ...current,
        canThrowBombs: true,
      };
  }
}
