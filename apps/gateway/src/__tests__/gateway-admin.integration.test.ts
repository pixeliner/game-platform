import {
  decodeMessage,
  encodeMessage,
  type GameOverMessage,
  type LobbyAdminActionResultMessage,
  type LobbyAuthIssuedMessage,
  type LobbyErrorMessage,
  type LobbyStartAcceptedMessage,
  type LobbyStateMessage,
  type MatchByRoomResponse,
  type ProtocolMessage,
  matchByRoomResponseSchema,
} from '@game-platform/protocol';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';

import type { GatewayConfig } from '../config.js';
import { createGatewayServer, type GatewayServer } from '../index.js';

interface TestClient {
  socket: WebSocket;
  messages: ProtocolMessage[];
}

interface LobbySetup {
  host: TestClient;
  guest: TestClient;
  lobbyId: string;
  hostPlayerId: string;
  guestPlayerId: string;
  hostToken: string;
  guestToken: string;
}

async function connectClient(url: string): Promise<TestClient> {
  const socket = new WebSocket(url);
  const messages: ProtocolMessage[] = [];

  await new Promise<void>((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });

  socket.on('message', (raw, isBinary) => {
    if (isBinary) {
      return;
    }

    const text =
      typeof raw === 'string'
        ? raw
        : Buffer.isBuffer(raw)
          ? raw.toString('utf8')
          : raw instanceof ArrayBuffer
            ? Buffer.from(raw).toString('utf8')
            : Buffer.concat(raw).toString('utf8');

    messages.push(decodeMessage(text));
  });

  return {
    socket,
    messages,
  };
}

function send(client: TestClient, message: ProtocolMessage): void {
  client.socket.send(encodeMessage(message));
}

async function waitMs(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForMessage<T extends ProtocolMessage>(
  client: TestClient,
  guard: (message: ProtocolMessage) => message is T,
  timeoutMs = 2_000,
): Promise<T> {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const index = client.messages.findIndex((message) => guard(message));
    if (index >= 0) {
      const [message] = client.messages.splice(index, 1);
      if (message) {
        return message as T;
      }
    }

    await waitMs(10);
  }

  throw new Error('Timed out waiting for message');
}

function isAuthIssued(message: ProtocolMessage): message is LobbyAuthIssuedMessage {
  return message.type === 'lobby.auth.issued';
}

function isLobbyState(message: ProtocolMessage): message is LobbyStateMessage {
  return message.type === 'lobby.state';
}

function isLobbyError(message: ProtocolMessage): message is LobbyErrorMessage {
  return message.type === 'lobby.error';
}

function isStartAccepted(message: ProtocolMessage): message is LobbyStartAcceptedMessage {
  return message.type === 'lobby.start.accepted';
}

function isAdminActionResult(message: ProtocolMessage): message is LobbyAdminActionResultMessage {
  return message.type === 'lobby.admin.action.result';
}

function isGameOver(message: ProtocolMessage): message is GameOverMessage {
  return message.type === 'game.over';
}

async function setupTwoPlayerLobby(url: string): Promise<LobbySetup> {
  const host = await connectClient(url);
  send(host, {
    v: 1,
    type: 'lobby.create',
    payload: {
      guestId: 'guest-host',
      nickname: 'Host',
      lobbyName: 'LAN',
    },
  });

  const hostAuth = await waitForMessage(host, isAuthIssued);
  const hostState = await waitForMessage(host, isLobbyState);

  const guest = await connectClient(url);
  send(guest, {
    v: 1,
    type: 'lobby.join',
    payload: {
      lobbyId: hostAuth.payload.lobbyId,
      guestId: 'guest-2',
      nickname: 'Guest',
    },
  });

  const guestAuth = await waitForMessage(guest, isAuthIssued);
  await waitForMessage(guest, isLobbyState);
  const updatedHostState = await waitForMessage(host, isLobbyState);

  const hostPlayer = hostState.payload.players.find((player) => player.guestId === 'guest-host');
  const guestPlayer = updatedHostState.payload.players.find((player) => player.guestId === 'guest-2');
  if (!hostPlayer || !guestPlayer) {
    throw new Error('Failed to resolve host/guest players.');
  }

  return {
    host,
    guest,
    lobbyId: hostAuth.payload.lobbyId,
    hostPlayerId: hostPlayer.playerId,
    guestPlayerId: guestPlayer.playerId,
    hostToken: hostAuth.payload.sessionToken,
    guestToken: guestAuth.payload.sessionToken,
  };
}

async function voteBomberman(setup: LobbySetup): Promise<void> {
  send(setup.host, {
    v: 1,
    type: 'lobby.vote.cast',
    payload: {
      lobbyId: setup.lobbyId,
      playerId: setup.hostPlayerId,
      gameId: 'bomberman',
    },
  });

  await waitForMessage(setup.host, isLobbyState);
  await waitForMessage(setup.guest, isLobbyState);
}

describe('gateway admin integration', () => {
  let server: GatewayServer;
  let wsUrl: string;
  let httpUrl: string;
  const clients: WebSocket[] = [];

  beforeEach(async () => {
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

    server = createGatewayServer({ config });
    await server.start();
    wsUrl = server.getWebSocketUrl();
    httpUrl = `http://127.0.0.1:${server.getPort()}`;
  });

  afterEach(async () => {
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN || client.readyState === WebSocket.CONNECTING) {
        client.close();
      }
    }
    clients.length = 0;
    await server.stop();
  });

  it('rejects admin actions from non-host players', async () => {
    const setup = await setupTwoPlayerLobby(wsUrl);
    clients.push(setup.host.socket, setup.guest.socket);

    send(setup.guest, {
      v: 1,
      type: 'lobby.admin.monitor.request',
      payload: {
        lobbyId: setup.lobbyId,
        requestedByPlayerId: setup.guestPlayerId,
      },
    });

    const error = await waitForMessage(setup.guest, isLobbyError);
    expect(error.payload.code).toBe('unauthorized');
  });

  it('applies host-configured tick rate to newly started rooms', async () => {
    const setup = await setupTwoPlayerLobby(wsUrl);
    clients.push(setup.host.socket, setup.guest.socket);

    await voteBomberman(setup);

    send(setup.host, {
      v: 1,
      type: 'lobby.admin.tick_rate.set',
      payload: {
        lobbyId: setup.lobbyId,
        requestedByPlayerId: setup.hostPlayerId,
        tickRate: 33,
      },
    });

    const action = await waitForMessage(
      setup.host,
      (message): message is LobbyAdminActionResultMessage =>
        isAdminActionResult(message) && message.payload.action === 'tick_rate.set',
    );
    expect(action.payload.status).toBe('accepted');
    expect(action.payload.tickRate).toBe(33);

    const hostState = await waitForMessage(setup.host, isLobbyState);
    const guestState = await waitForMessage(setup.guest, isLobbyState);
    expect(hostState.payload.configuredTickRate).toBe(33);
    expect(guestState.payload.configuredTickRate).toBe(33);

    send(setup.host, {
      v: 1,
      type: 'lobby.ready.set',
      payload: {
        lobbyId: setup.lobbyId,
        playerId: setup.hostPlayerId,
        isReady: true,
      },
    });
    await waitForMessage(setup.host, isLobbyState);
    await waitForMessage(setup.guest, isLobbyState);

    send(setup.guest, {
      v: 1,
      type: 'lobby.ready.set',
      payload: {
        lobbyId: setup.lobbyId,
        playerId: setup.guestPlayerId,
        isReady: true,
      },
    });
    await waitForMessage(setup.host, isLobbyState);
    await waitForMessage(setup.guest, isLobbyState);

    send(setup.host, {
      v: 1,
      type: 'lobby.start.request',
      payload: {
        lobbyId: setup.lobbyId,
        requestedByPlayerId: setup.hostPlayerId,
      },
    });

    const startAccepted = await waitForMessage(setup.host, isStartAccepted);
    expect(startAccepted.payload.tickRate).toBe(33);
  });

  it('force-starts while bypassing readiness precondition', async () => {
    const setup = await setupTwoPlayerLobby(wsUrl);
    clients.push(setup.host.socket, setup.guest.socket);

    await voteBomberman(setup);

    send(setup.host, {
      v: 1,
      type: 'lobby.admin.start.force',
      payload: {
        lobbyId: setup.lobbyId,
        requestedByPlayerId: setup.hostPlayerId,
      },
    });

    const startAccepted = await waitForMessage(setup.host, isStartAccepted);
    expect(startAccepted.payload.lobbyId).toBe(setup.lobbyId);

    const action = await waitForMessage(
      setup.host,
      (message): message is LobbyAdminActionResultMessage =>
        isAdminActionResult(message) && message.payload.action === 'start.force',
    );
    expect(action.payload.status).toBe('accepted');
    expect(action.payload.roomId).toBe(startAccepted.payload.roomId);
  });

  it('kicks target player, removes them from lobby, and invalidates old reconnect token', async () => {
    const setup = await setupTwoPlayerLobby(wsUrl);
    clients.push(setup.host.socket, setup.guest.socket);

    let guestClosed = false;
    setup.guest.socket.once('close', () => {
      guestClosed = true;
    });

    send(setup.host, {
      v: 1,
      type: 'lobby.admin.kick',
      payload: {
        lobbyId: setup.lobbyId,
        requestedByPlayerId: setup.hostPlayerId,
        targetPlayerId: setup.guestPlayerId,
        reason: 'afk',
      },
    });

    const action = await waitForMessage(
      setup.host,
      (message): message is LobbyAdminActionResultMessage =>
        isAdminActionResult(message) && message.payload.action === 'kick',
    );
    expect(action.payload.status).toBe('accepted');
    expect(action.payload.targetPlayerId).toBe(setup.guestPlayerId);

    const state = await waitForMessage(setup.host, isLobbyState);
    expect(state.payload.players.some((player) => player.playerId === setup.guestPlayerId)).toBe(false);

    await waitMs(100);
    expect(guestClosed).toBe(true);

    const reconnectClient = await connectClient(wsUrl);
    clients.push(reconnectClient.socket);
    send(reconnectClient, {
      v: 1,
      type: 'lobby.join',
      payload: {
        lobbyId: setup.lobbyId,
        guestId: 'guest-2',
        nickname: 'Guest',
        sessionToken: setup.guestToken,
      },
    });

    const reconnectError = await waitForMessage(reconnectClient, isLobbyError);
    expect(reconnectError.payload.code).toBe('invalid_session_token');
  });

  it('supports pause/resume/force-end room controls and persists admin_forced results', async () => {
    const setup = await setupTwoPlayerLobby(wsUrl);
    clients.push(setup.host.socket, setup.guest.socket);

    await voteBomberman(setup);

    send(setup.host, {
      v: 1,
      type: 'lobby.admin.start.force',
      payload: {
        lobbyId: setup.lobbyId,
        requestedByPlayerId: setup.hostPlayerId,
      },
    });

    const startAccepted = await waitForMessage(setup.host, isStartAccepted);

    send(setup.host, {
      v: 1,
      type: 'game.join',
      payload: {
        roomId: startAccepted.payload.roomId,
        playerId: setup.hostPlayerId,
      },
    });

    await waitForMessage(
      setup.host,
      (message): message is ProtocolMessage & { type: 'game.join.accepted' } => message.type === 'game.join.accepted',
    );

    send(setup.host, {
      v: 1,
      type: 'lobby.admin.room.pause',
      payload: {
        lobbyId: setup.lobbyId,
        roomId: startAccepted.payload.roomId,
        requestedByPlayerId: setup.hostPlayerId,
      },
    });

    await waitForMessage(
      setup.host,
      (message): message is LobbyAdminActionResultMessage =>
        isAdminActionResult(message) && message.payload.action === 'room.pause',
    );

    send(setup.host, {
      v: 1,
      type: 'lobby.admin.monitor.request',
      payload: {
        lobbyId: setup.lobbyId,
        requestedByPlayerId: setup.hostPlayerId,
      },
    });

    const pausedMonitor = await waitForMessage(
      setup.host,
      (message): message is ProtocolMessage & { type: 'lobby.admin.monitor.state' } =>
        message.type === 'lobby.admin.monitor.state',
    );
    expect(pausedMonitor.payload.activeRoomRuntimeState).toBe('paused');

    send(setup.host, {
      v: 1,
      type: 'lobby.admin.room.resume',
      payload: {
        lobbyId: setup.lobbyId,
        roomId: startAccepted.payload.roomId,
        requestedByPlayerId: setup.hostPlayerId,
      },
    });
    await waitForMessage(
      setup.host,
      (message): message is LobbyAdminActionResultMessage =>
        isAdminActionResult(message) && message.payload.action === 'room.resume',
    );

    send(setup.host, {
      v: 1,
      type: 'lobby.admin.monitor.request',
      payload: {
        lobbyId: setup.lobbyId,
        requestedByPlayerId: setup.hostPlayerId,
      },
    });

    const runningMonitor = await waitForMessage(
      setup.host,
      (message): message is ProtocolMessage & { type: 'lobby.admin.monitor.state' } =>
        message.type === 'lobby.admin.monitor.state',
    );
    expect(runningMonitor.payload.activeRoomRuntimeState).toBe('running');

    send(setup.host, {
      v: 1,
      type: 'lobby.admin.room.force_end',
      payload: {
        lobbyId: setup.lobbyId,
        roomId: startAccepted.payload.roomId,
        requestedByPlayerId: setup.hostPlayerId,
      },
    });

    await waitForMessage(setup.host, isGameOver);
    const waitingState = await waitForMessage(
      setup.host,
      (message): message is LobbyStateMessage =>
        isLobbyState(message) && message.payload.phase === 'waiting',
      5_000,
    );
    expect(waitingState.payload.activeRoomId).toBeNull();
    expect(waitingState.payload.activeRoomRuntimeState).toBeNull();

    const response = await fetch(`${httpUrl}/api/matches/${encodeURIComponent(startAccepted.payload.roomId)}`);
    expect(response.status).toBe(200);
    const parsed = matchByRoomResponseSchema.safeParse(await response.json());
    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      return;
    }

    const record: MatchByRoomResponse = parsed.data;
    expect(record.item.endReason).toBe('admin_forced');
  });
});
