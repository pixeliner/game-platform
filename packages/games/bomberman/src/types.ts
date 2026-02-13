export type BombermanPhase = 'running' | 'finished';

export type BombermanDirection = 'up' | 'down' | 'left' | 'right';
export type BombermanMovementModel = 'grid_smooth' | 'true_transit';

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
    };

export interface BombermanPlayerSnapshot {
  playerId: string;
  x: number;
  y: number;
  alive: boolean;
  direction: BombermanDirection | null;
  activeBombCount: number;
}

export interface BombermanBombSnapshot {
  ownerPlayerId: string;
  x: number;
  y: number;
  fuseTicksRemaining: number;
  radius: number;
}

export interface BombermanFlameSnapshot {
  x: number;
  y: number;
  ticksRemaining: number;
  sourceOwnerPlayerId: string | null;
}

export interface BombermanSnapshot {
  tick: number;
  phase: BombermanPhase;
  width: number;
  height: number;
  hardWalls: TilePosition[];
  softBlocks: TilePosition[];
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
      kind: 'block.destroyed';
      x: number;
      y: number;
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
