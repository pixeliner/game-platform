import {
  applyPowerupToPlayer,
  resolveMoveCooldownTicks,
} from '../balance.js';
import { pushBombermanEvent } from '../events.js';
import {
  getPlayerEntityIds,
  getPowerupEntityAt,
} from '../state/helpers.js';
import type { BombermanSimulationState } from '../state/setup-world.js';

export function runPowerupSystem(state: BombermanSimulationState): void {
  for (const playerEntityId of getPlayerEntityIds(state)) {
    const player = state.world.getComponent(playerEntityId, 'player');
    const position = state.world.getComponent(playerEntityId, 'position');
    if (!player || !position || !player.alive) {
      continue;
    }

    const powerupEntityId = getPowerupEntityAt(state, position.x, position.y);
    if (powerupEntityId === undefined) {
      continue;
    }

    const powerup = state.world.getComponent(powerupEntityId, 'powerup');
    if (!powerup) {
      continue;
    }

    const updated = applyPowerupToPlayer(powerup.kind, {
      bombLimit: player.bombLimit,
      blastRadius: player.blastRadius,
      speedTier: player.speedTier,
      hasRemoteDetonator: player.hasRemoteDetonator,
      canKickBombs: player.canKickBombs,
      canThrowBombs: player.canThrowBombs,
    });

    player.bombLimit = updated.bombLimit;
    player.blastRadius = updated.blastRadius;
    player.speedTier = updated.speedTier;
    player.hasRemoteDetonator = updated.hasRemoteDetonator;
    player.canKickBombs = updated.canKickBombs;
    player.canThrowBombs = updated.canThrowBombs;
    player.moveTicksPerTile = resolveMoveCooldownTicks(player.speedTier);

    state.world.destroyEntity(powerupEntityId);

    pushBombermanEvent(state, {
      kind: 'powerup.collected',
      playerId: player.playerId,
      x: position.x,
      y: position.y,
      powerupKind: powerup.kind,
    });
  }
}
