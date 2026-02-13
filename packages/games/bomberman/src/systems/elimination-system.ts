import { MAX_MATCH_TICKS, toTileKey } from '../constants.js';
import { pushBombermanEvent } from '../events.js';
import { getFlameEntityIds, getPlayerEntityIds } from '../state/helpers.js';
import type { BombermanSimulationState, RoundOverReason } from '../state/setup-world.js';

export function runEliminationSystem(state: BombermanSimulationState): void {
  if (state.phase === 'finished') {
    return;
  }

  const flameOwnersByTileKey = new Map<string, string[]>();
  for (const flameEntityId of getFlameEntityIds(state)) {
    const flame = state.world.getComponent(flameEntityId, 'flame');
    const position = state.world.getComponent(flameEntityId, 'position');
    if (!flame || !position) {
      continue;
    }

    const key = toTileKey(position.x, position.y);
    const existing = flameOwnersByTileKey.get(key) ?? [];
    if (flame.sourceOwnerPlayerId !== null) {
      existing.push(flame.sourceOwnerPlayerId);
      existing.sort((a, b) => a.localeCompare(b));
    }

    flameOwnersByTileKey.set(key, existing);
  }

  for (const playerEntityId of getPlayerEntityIds(state)) {
    const player = state.world.getComponent(playerEntityId, 'player');
    const position = state.world.getComponent(playerEntityId, 'position');
    if (!player || !position || !player.alive) {
      continue;
    }

    const key = toTileKey(position.x, position.y);
    if (!flameOwnersByTileKey.has(key)) {
      continue;
    }

    const owners = flameOwnersByTileKey.get(key) ?? [];
    const byPlayerId = owners.at(0) ?? null;

    player.alive = false;
    player.eliminatedAtTick = state.tick;
    player.desiredDirection = null;
    player.queuedBombPlacement = false;

    pushBombermanEvent(state, {
      kind: 'player.eliminated',
      playerId: player.playerId,
      byPlayerId,
      x: position.x,
      y: position.y,
    });
  }

  const alivePlayers = getAlivePlayerIds(state);
  if (alivePlayers.length <= 1) {
    endRound(state, alivePlayers.at(0) ?? null, 'last_player_standing');
    return;
  }

  if (state.tick >= MAX_MATCH_TICKS) {
    const winner = alivePlayers.length === 1 ? (alivePlayers[0] ?? null) : null;
    endRound(state, winner, 'tick_limit');
  }
}

function getAlivePlayerIds(state: BombermanSimulationState): string[] {
  const alive: string[] = [];

  for (const playerEntityId of getPlayerEntityIds(state)) {
    const player = state.world.getComponent(playerEntityId, 'player');
    if (!player || !player.alive) {
      continue;
    }

    alive.push(player.playerId);
  }

  alive.sort((a, b) => a.localeCompare(b));
  return alive;
}

function endRound(
  state: BombermanSimulationState,
  winnerPlayerId: string | null,
  reason: RoundOverReason,
): void {
  state.phase = 'finished';
  state.winnerPlayerId = winnerPlayerId;
  state.roundOverReason = reason;

  pushBombermanEvent(state, {
    kind: 'round.over',
    winnerPlayerId,
    reason,
  });
}
