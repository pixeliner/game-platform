import { compareTilePositions } from './constants.js';
import type { BombermanSnapshot } from './types.js';
import type { BombermanSimulationState } from './state/setup-world.js';

export function buildBombermanSnapshot(state: BombermanSimulationState): BombermanSnapshot {
  const softBlocks = state.world
    .query(['destructible', 'position'])
    .map((entityId) => {
      const destructible = state.world.getComponent(entityId, 'destructible');
      const position = state.world.getComponent(entityId, 'position');
      if (!destructible || !position) {
        return undefined;
      }

      return {
        x: position.x,
        y: position.y,
        kind: destructible.kind,
      };
    })
    .filter((position): position is NonNullable<typeof position> => position !== undefined)
    .sort((a, b) => {
      const tile = compareTilePositions(a, b);
      if (tile !== 0) {
        return tile;
      }

      return a.kind.localeCompare(b.kind);
    });

  const powerups = state.world
    .query(['powerup', 'position'])
    .map((entityId) => {
      const powerup = state.world.getComponent(entityId, 'powerup');
      const position = state.world.getComponent(entityId, 'position');
      if (!powerup || !position) {
        return undefined;
      }

      return {
        x: position.x,
        y: position.y,
        kind: powerup.kind,
      };
    })
    .filter((powerup): powerup is NonNullable<typeof powerup> => powerup !== undefined)
    .sort((a, b) => {
      const tile = compareTilePositions(a, b);
      if (tile !== 0) {
        return tile;
      }

      return a.kind.localeCompare(b.kind);
    });

  const players = state.world
    .query(['player', 'position'])
    .map((entityId) => {
      const player = state.world.getComponent(entityId, 'player');
      const position = state.world.getComponent(entityId, 'position');
      if (!player || !position) {
        return undefined;
      }

      return {
        playerId: player.playerId,
        x: player.renderX,
        y: player.renderY,
        alive: player.alive,
        direction: player.desiredDirection ?? player.lastFacingDirection,
        activeBombCount: player.activeBombCount,
        bombLimit: player.bombLimit,
        blastRadius: player.blastRadius,
        speedTier: player.speedTier,
        hasRemoteDetonator: player.hasRemoteDetonator,
        canKickBombs: player.canKickBombs,
        canThrowBombs: player.canThrowBombs,
      };
    })
    .filter((player): player is NonNullable<typeof player> => player !== undefined)
    .sort((a, b) => a.playerId.localeCompare(b.playerId));

  const bombs = state.world
    .query(['bomb', 'position'])
    .map((entityId) => {
      const bomb = state.world.getComponent(entityId, 'bomb');
      const position = state.world.getComponent(entityId, 'position');
      if (!bomb || !position) {
        return undefined;
      }

      return {
        ownerPlayerId: bomb.ownerPlayerId,
        x: position.x,
        y: position.y,
        fuseTicksRemaining: bomb.fuseTicksRemaining,
        radius: bomb.radius,
        movingDirection: bomb.movingDirection,
      };
    })
    .filter((bomb): bomb is NonNullable<typeof bomb> => bomb !== undefined)
    .sort((a, b) => {
      if (a.y !== b.y) {
        return a.y - b.y;
      }

      if (a.x !== b.x) {
        return a.x - b.x;
      }

      return a.ownerPlayerId.localeCompare(b.ownerPlayerId);
    });

  const flames = state.world
    .query(['flame', 'position'])
    .map((entityId) => {
      const flame = state.world.getComponent(entityId, 'flame');
      const position = state.world.getComponent(entityId, 'position');
      if (!flame || !position) {
        return undefined;
      }

      return {
        x: position.x,
        y: position.y,
        ticksRemaining: flame.ticksRemaining,
        sourceOwnerPlayerId: flame.sourceOwnerPlayerId,
      };
    })
    .filter((flame): flame is NonNullable<typeof flame> => flame !== undefined)
    .sort((a, b) => {
      if (a.y === b.y) {
        return a.x - b.x;
      }

      return a.y - b.y;
    });

  return {
    tick: state.tick,
    phase: state.phase,
    width: state.map.width,
    height: state.map.height,
    hardWalls: state.map.hardWallPositions.map((position) => ({ x: position.x, y: position.y })),
    softBlocks,
    powerups,
    players,
    bombs,
    flames,
    winnerPlayerId: state.winnerPlayerId,
  };
}
