import { compareTilePositions } from './constants.js';
import type { BombermanSnapshot } from './types.js';
import type { BombermanSimulationState } from './state/setup-world.js';

export function buildBombermanSnapshot(state: BombermanSimulationState): BombermanSnapshot {
  const softBlocks = state.world
    .query(['destructible', 'position'])
    .map((entityId) => state.world.getComponent(entityId, 'position'))
    .filter((position): position is { x: number; y: number } => position !== undefined)
    .sort(compareTilePositions)
    .map((position) => ({ x: position.x, y: position.y }));

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
        direction: player.desiredDirection,
        activeBombCount: player.activeBombCount,
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
      };
    })
    .filter((bomb): bomb is NonNullable<typeof bomb> => bomb !== undefined)
    .sort((a, b) => {
      if (a.ownerPlayerId !== b.ownerPlayerId) {
        return a.ownerPlayerId.localeCompare(b.ownerPlayerId);
      }

      if (a.y === b.y) {
        return a.x - b.x;
      }

      return a.y - b.y;
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
    players,
    bombs,
    flames,
    winnerPlayerId: state.winnerPlayerId,
  };
}
