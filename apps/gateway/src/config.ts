import { randomBytes } from 'node:crypto';
import type { BombermanMovementModel } from '@game-platform/game-bomberman';

export interface GatewayConfig {
  host: string;
  port: number;
  sessionTtlMs: number;
  reconnectGraceMs: number;
  tickRate: number;
  snapshotEveryTicks: number;
  bombermanMovementModel: BombermanMovementModel;
  roomIdleTimeoutMs: number;
  sessionSecret: string;
  sqlitePath: string;
}

const DEFAULT_HOST = '0.0.0.0';
const DEFAULT_PORT = 8787;
const DEFAULT_SESSION_TTL_MS = 900_000;
const DEFAULT_RECONNECT_GRACE_MS = 120_000;
const DEFAULT_TICK_RATE = 20;
const DEFAULT_SNAPSHOT_EVERY_TICKS = 2;
const DEFAULT_BOMBERMAN_MOVEMENT_MODEL = 'grid_smooth' satisfies BombermanMovementModel;
const DEFAULT_ROOM_IDLE_TIMEOUT_MS = 30_000;
const DEFAULT_SQLITE_PATH = './.data/game-platform.sqlite';

function readPositiveInt(name: string, rawValue: string | undefined, fallback: number): number {
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${name}: expected positive integer, received ${rawValue}`);
  }

  return parsed;
}

function readBombermanMovementModel(rawValue: string | undefined): BombermanMovementModel {
  if (rawValue === undefined || rawValue.length === 0) {
    return DEFAULT_BOMBERMAN_MOVEMENT_MODEL;
  }

  if (rawValue === 'grid_smooth' || rawValue === 'true_transit') {
    return rawValue;
  }

  throw new Error(
    `Invalid GATEWAY_BOMBERMAN_MOVEMENT_MODEL: expected grid_smooth or true_transit, received ${rawValue}`,
  );
}

export function loadGatewayConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  return {
    host: env.GATEWAY_HOST ?? DEFAULT_HOST,
    port: readPositiveInt('GATEWAY_PORT', env.GATEWAY_PORT, DEFAULT_PORT),
    sessionTtlMs: readPositiveInt('GATEWAY_SESSION_TTL_MS', env.GATEWAY_SESSION_TTL_MS, DEFAULT_SESSION_TTL_MS),
    reconnectGraceMs: readPositiveInt(
      'GATEWAY_RECONNECT_GRACE_MS',
      env.GATEWAY_RECONNECT_GRACE_MS,
      DEFAULT_RECONNECT_GRACE_MS,
    ),
    tickRate: readPositiveInt('GATEWAY_TICK_RATE', env.GATEWAY_TICK_RATE, DEFAULT_TICK_RATE),
    snapshotEveryTicks: readPositiveInt(
      'GATEWAY_SNAPSHOT_EVERY_TICKS',
      env.GATEWAY_SNAPSHOT_EVERY_TICKS,
      DEFAULT_SNAPSHOT_EVERY_TICKS,
    ),
    bombermanMovementModel: readBombermanMovementModel(env.GATEWAY_BOMBERMAN_MOVEMENT_MODEL),
    roomIdleTimeoutMs: readPositiveInt(
      'GATEWAY_ROOM_IDLE_TIMEOUT_MS',
      env.GATEWAY_ROOM_IDLE_TIMEOUT_MS,
      DEFAULT_ROOM_IDLE_TIMEOUT_MS,
    ),
    sessionSecret: env.GATEWAY_SESSION_SECRET ?? randomBytes(32).toString('hex'),
    sqlitePath: env.GATEWAY_SQLITE_PATH ?? DEFAULT_SQLITE_PATH,
  };
}
