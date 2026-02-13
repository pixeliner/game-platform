import { describe, expect, it } from 'vitest';

import {
  ADMIN_TICK_RATE_MAX,
  ADMIN_TICK_RATE_MIN,
  lobbyAdminActionResultMessageSchema,
  lobbyAdminMonitorStateMessageSchema,
  lobbyAdminTickRateSetMessageSchema,
  lobbyStateMessageSchema,
} from '../index.js';

describe('lobby admin contracts', () => {
  it('parses monitor state payload with room diagnostics', () => {
    const parsed = lobbyAdminMonitorStateMessageSchema.safeParse({
      v: 1,
      type: 'lobby.admin.monitor.state',
      payload: {
        lobbyId: 'lobby-1',
        generatedAtMs: 1700000000000,
        hostPlayerId: 'player-1',
        phase: 'in_game',
        activeRoomId: 'room-1',
        activeRoomRuntimeState: 'running',
        configuredTickRate: 20,
        connectedPlayerCount: 2,
        totalPlayerCount: 3,
        room: {
          roomId: 'room-1',
          gameId: 'bomberman',
          tickRate: 20,
          tick: 15,
          runtimeState: 'running',
          participantCount: 2,
          connectedParticipantCount: 2,
          spectatorCount: 1,
          startedAtMs: 1700000001000,
        },
      },
    });

    expect(parsed.success).toBe(true);
  });

  it('parses lobby.state with configured tick rate and runtime state', () => {
    const parsed = lobbyStateMessageSchema.safeParse({
      v: 1,
      type: 'lobby.state',
      payload: {
        lobbyId: 'lobby-1',
        lobbyName: 'LAN',
        hostPlayerId: 'player-1',
        phase: 'waiting',
        activeRoomId: null,
        activeRoomRuntimeState: null,
        selectedGameId: 'bomberman',
        configuredTickRate: ADMIN_TICK_RATE_MIN,
        requiresPassword: false,
        maxPlayers: 4,
        players: [],
        votesByPlayerId: {},
      },
    });

    expect(parsed.success).toBe(true);
  });

  it('parses admin action result payload', () => {
    const parsed = lobbyAdminActionResultMessageSchema.safeParse({
      v: 1,
      type: 'lobby.admin.action.result',
      payload: {
        lobbyId: 'lobby-1',
        action: 'kick',
        status: 'accepted',
        requestedByPlayerId: 'player-1',
        targetPlayerId: 'player-2',
        message: 'Player was kicked.',
        atMs: 1700000002000,
      },
    });

    expect(parsed.success).toBe(true);
  });

  it('rejects tick-rate set payload outside allowed range', () => {
    const belowMin = lobbyAdminTickRateSetMessageSchema.safeParse({
      v: 1,
      type: 'lobby.admin.tick_rate.set',
      payload: {
        lobbyId: 'lobby-1',
        requestedByPlayerId: 'player-1',
        tickRate: ADMIN_TICK_RATE_MIN - 1,
      },
    });

    const aboveMax = lobbyAdminTickRateSetMessageSchema.safeParse({
      v: 1,
      type: 'lobby.admin.tick_rate.set',
      payload: {
        lobbyId: 'lobby-1',
        requestedByPlayerId: 'player-1',
        tickRate: ADMIN_TICK_RATE_MAX + 1,
      },
    });

    expect(belowMin.success).toBe(false);
    expect(aboveMax.success).toBe(false);
  });
});
