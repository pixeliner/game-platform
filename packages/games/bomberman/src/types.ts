export type BombermanPhase = 'running' | 'finished';

export type BombermanDirection = 'up' | 'down' | 'left' | 'right';
export type BombermanMovementModel = 'grid_smooth' | 'true_transit';

export type BombermanPowerupKind =
  | 'bomb_up'
  | 'blast_up'
  | 'speed_up'
  | 'remote_detonator'
  | 'kick_bombs'
  | 'throw_bombs';

export type BombermanDestructibleKind = 'brick' | 'crate' | 'barrel';

export interface TilePosition {
  x: number;
  y: number;
}

export interface BombermanConfig {
  playerIds: string[];
  movementModel?: BombermanMovementModel;
}

export type BombermanInput =
  | {
      kind: 'move.intent';
      direction: BombermanDirection | null;
    }
  | {
      kind: 'bomb.place';
    }
  | {
      kind: 'bomb.remote_detonate';
    }
  | {
      kind: 'bomb.throw';
    };

export interface BombermanPlayerSnapshot {
  playerId: string;
  x: number;
  y: number;
  alive: boolean;
  direction: BombermanDirection | null;
  activeBombCount: number;
  bombLimit: number;
  blastRadius: number;
  speedTier: number;
  hasRemoteDetonator: boolean;
  canKickBombs: boolean;
  canThrowBombs: boolean;
}

export interface BombermanBombSnapshot {
  ownerPlayerId: string;
  x: number;
  y: number;
  fuseTicksRemaining: number;
  radius: number;
  movingDirection: BombermanDirection | null;
}

export interface BombermanFlameSnapshot {
  x: number;
  y: number;
  ticksRemaining: number;
  sourceOwnerPlayerId: string | null;
}

export interface BombermanSoftBlockSnapshot {
  x: number;
  y: number;
  kind: BombermanDestructibleKind;
}

export interface BombermanPowerupSnapshot {
  x: number;
  y: number;
  kind: BombermanPowerupKind;
}

export interface BombermanSnapshot {
  tick: number;
  phase: BombermanPhase;
  width: number;
  height: number;
  hardWalls: TilePosition[];
  softBlocks: BombermanSoftBlockSnapshot[];
  powerups: BombermanPowerupSnapshot[];
  players: BombermanPlayerSnapshot[];
  bombs: BombermanBombSnapshot[];
  flames: BombermanFlameSnapshot[];
  winnerPlayerId: string | null;
}

export type BombermanEvent =
  | {
      kind: 'player.moved';
      playerId: string;
      from: TilePosition;
      to: TilePosition;
      direction: BombermanDirection;
    }
  | {
      kind: 'bomb.placed';
      playerId: string;
      x: number;
      y: number;
      fuseTicksRemaining: number;
      radius: number;
    }
  | {
      kind: 'bomb.exploded';
      ownerPlayerId: string;
      x: number;
      y: number;
      affectedTiles: TilePosition[];
    }
  | {
      kind: 'bomb.kicked';
      byPlayerId: string;
      ownerPlayerId: string;
      from: TilePosition;
      to: TilePosition;
      direction: BombermanDirection;
    }
  | {
      kind: 'bomb.thrown';
      byPlayerId: string;
      ownerPlayerId: string;
      from: TilePosition;
      to: TilePosition;
      direction: BombermanDirection;
    }
  | {
      kind: 'bomb.remote_detonated';
      playerId: string;
      x: number;
      y: number;
    }
  | {
      kind: 'block.destroyed';
      x: number;
      y: number;
      blockKind: BombermanDestructibleKind;
      droppedPowerupKind: BombermanPowerupKind | null;
    }
  | {
      kind: 'powerup.spawned';
      x: number;
      y: number;
      powerupKind: BombermanPowerupKind;
    }
  | {
      kind: 'powerup.collected';
      playerId: string;
      x: number;
      y: number;
      powerupKind: BombermanPowerupKind;
    }
  | {
      kind: 'player.eliminated';
      playerId: string;
      byPlayerId: string | null;
      x: number;
      y: number;
    }
  | {
      kind: 'round.over';
      winnerPlayerId: string | null;
      reason: 'last_player_standing' | 'tick_limit';
    };

export interface BombermanResult {
  playerId: string;
  rank: number;
  score: number;
  alive: boolean;
  eliminatedAtTick: number | null;
}

export interface BombermanGameResults {
  winnerPlayerId: string | null;
  results: BombermanResult[];
}
