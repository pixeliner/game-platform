import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  lobbyDiscoveryResponseSchema,
  lobbyQuickJoinResponseSchema,
} from '@game-platform/protocol';
import { SqliteMatchRepository } from '@game-platform/storage';

import type { GatewayConfig } from '../config.js';
import { createGatewayServer, type GatewayServer } from '../index.js';
import { createLobbyPasswordService } from '../auth/lobby-password-service.js';
import { LobbyStateMachine } from '../lobby/lobby-state-machine.js';

describe('gateway lobby discovery HTTP API', () => {
  let server: GatewayServer;
  let baseUrl: string;

  beforeEach(async () => {
    const stateMachine = new LobbyStateMachine();
    const passwordService = createLobbyPasswordService();

    stateMachine.createLobby({
      lobbyId: 'lobby-open',
      playerId: 'player-open-1',
      guestId: 'guest-open-1',
      nickname: 'OpenHost',
      lobbyName: 'Open Lobby',
      maxPlayers: 4,
      configuredTickRate: 20,
      passwordHash: null,
      nowMs: 1000,
    });
    stateMachine.joinLobby({
      lobbyId: 'lobby-open',
      playerId: 'player-open-2',
      guestId: 'guest-open-2',
      nickname: 'OpenGuest',
      nowMs: 1100,
    });

    stateMachine.createLobby({
      lobbyId: 'lobby-protected',
      playerId: 'player-protected-1',
      guestId: 'guest-protected-1',
      nickname: 'ProtectedHost',
      lobbyName: 'Protected Lobby',
      maxPlayers: 4,
      configuredTickRate: 20,
      passwordHash: passwordService.hashPassword('secret-pass'),
      nowMs: 1200,
    });

    stateMachine.createLobby({
      lobbyId: 'lobby-in-game',
      playerId: 'player-ingame-1',
      guestId: 'guest-ingame-1',
      nickname: 'InGameHost',
      lobbyName: 'In Game Lobby',
      maxPlayers: 4,
      configuredTickRate: 20,
      passwordHash: null,
      nowMs: 1300,
    });
    stateMachine.joinLobby({
      lobbyId: 'lobby-in-game',
      playerId: 'player-ingame-2',
      guestId: 'guest-ingame-2',
      nickname: 'InGameGuest',
      nowMs: 1400,
    });
    stateMachine.setInGame('lobby-in-game', 'room-ingame', 1500);

    const config: GatewayConfig = {
      host: '127.0.0.1',
      port: 0,
      sessionTtlMs: 5_000,
      reconnectGraceMs: 1_000,
      tickRate: 20,
      snapshotEveryTicks: 2,
      lobbyMaxPlayers: 4,
      bombermanMovementModel: 'grid_smooth',
      roomIdleTimeoutMs: 100,
      sessionSecret: 'test-secret',
      sqlitePath: ':memory:',
    };

    server = createGatewayServer({
      config,
      clock: {
        nowMs: () => 10_000,
      },
      stateMachine,
      matchRepository: new SqliteMatchRepository({
        dbPath: ':memory:',
      }),
    });

    await server.start();
    baseUrl = `http://127.0.0.1:${server.getPort()}`;
  });

  afterEach(async () => {
    await server.stop();
  });

  it('returns lobbies with filters and deterministic sorting', async () => {
    const response = await fetch(`${baseUrl}/api/lobbies?limit=20&offset=0&sort=connected_desc`);
    expect(response.status).toBe(200);

    const body = await response.json();
    const parsed = lobbyDiscoveryResponseSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      return;
    }

    expect(parsed.data.page.total).toBe(3);
    expect(parsed.data.items[0]?.lobbyId).toBe('lobby-in-game');
    expect(parsed.data.items[1]?.lobbyId).toBe('lobby-open');

    const protectedLobby = parsed.data.items.find((item) => item.lobbyId === 'lobby-protected');
    expect(protectedLobby?.requiresPassword).toBe(true);

    const inGameLobby = parsed.data.items.find((item) => item.lobbyId === 'lobby-in-game');
    expect(inGameLobby?.phase).toBe('in_game');

    const protectedOnlyResponse = await fetch(`${baseUrl}/api/lobbies?access=protected`);
    const protectedOnlyBody = await protectedOnlyResponse.json();
    const protectedOnlyParsed = lobbyDiscoveryResponseSchema.safeParse(protectedOnlyBody);
    expect(protectedOnlyParsed.success).toBe(true);
    if (!protectedOnlyParsed.success) {
      return;
    }

    expect(protectedOnlyParsed.data.page.total).toBe(1);
    expect(protectedOnlyParsed.data.items[0]?.lobbyId).toBe('lobby-protected');
  });

  it('returns best-fit open waiting lobby for quick join', async () => {
    const response = await fetch(`${baseUrl}/api/lobbies/quick-join`);
    expect(response.status).toBe(200);

    const body = await response.json();
    const parsed = lobbyQuickJoinResponseSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      return;
    }

    expect(parsed.data.item?.lobbyId).toBe('lobby-open');
    expect(parsed.data.item?.requiresPassword).toBe(false);
    expect(parsed.data.item?.phase).toBe('waiting');
  });

  it('validates query parameters for discovery endpoints', async () => {
    const discoveryResponse = await fetch(`${baseUrl}/api/lobbies?sort=random`);
    expect(discoveryResponse.status).toBe(400);

    const quickJoinResponse = await fetch(`${baseUrl}/api/lobbies/quick-join?gameId=`);
    expect(quickJoinResponse.status).toBe(400);
  });
});
