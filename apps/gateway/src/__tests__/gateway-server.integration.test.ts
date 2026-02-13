import {
  decodeMessage,
  encodeMessage,
  type LobbyAuthIssuedMessage,
  type LobbyStateMessage,
  type ProtocolMessage,
} from '@game-platform/protocol';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';

import type { GatewayConfig } from '../config.js';
import { createGatewayServer, type GatewayServer } from '../index.js';

class MutableClock {
  private now = 1_700_000_000_000;

  public nowMs(): number {
    return this.now;
  }

  public advance(ms: number): void {
    this.now += ms;
  }
}

interface TestClient {
  socket: WebSocket;
  messages: ProtocolMessage[];
}

async function connectClient(url: string): Promise<TestClient> {
  const socket = new WebSocket(url);
  const messages: ProtocolMessage[] = [];

  await new Promise<void>((resolve, reject) => {
    socket.once('open', () => resolve());
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

    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error('Timed out waiting for message');
}

function isAuthIssued(message: ProtocolMessage): message is LobbyAuthIssuedMessage {
  return message.type === 'lobby.auth.issued';
}

function isLobbyState(message: ProtocolMessage): message is LobbyStateMessage {
  return message.type === 'lobby.state';
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
    throw new Error('Failed to resolve player identities in test setup.');
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

describe('gateway websocket integration', () => {
  let server: GatewayServer;
  let url: string;
  let clock: MutableClock;
  const clients: WebSocket[] = [];

  beforeEach(async () => {
    clock = new MutableClock();
    const config: GatewayConfig = {
      host: '127.0.0.1',
      port: 0,
      sessionTtlMs: 100,
      reconnectGraceMs: 1_000,
      tickRate: 20,
      sessionSecret: 'test-secret',
    };

    server = createGatewayServer({
      config,
      clock,
    });

    await server.start();
    url = server.getWebSocketUrl();
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

  it('creates and joins lobbies with state broadcasts and auth token issuance', async () => {
    const setup = await setupTwoPlayerLobby(url);
    clients.push(setup.host.socket, setup.guest.socket);

    expect(setup.lobbyId).toBeTruthy();
    expect(setup.hostToken).toBeTruthy();
    expect(setup.guestToken).toBeTruthy();
  });

  it('broadcasts chat messages', async () => {
    const setup = await setupTwoPlayerLobby(url);
    clients.push(setup.host.socket, setup.guest.socket);

    send(setup.host, {
      v: 1,
      type: 'lobby.chat.send',
      payload: {
        lobbyId: setup.lobbyId,
        playerId: setup.hostPlayerId,
        text: 'hello everyone',
      },
    });

    const guestChat = await waitForMessage(
      setup.guest,
      (message): message is ProtocolMessage & { type: 'lobby.chat.message' } =>
        message.type === 'lobby.chat.message',
    );

    expect(guestChat.payload.text).toBe('hello everyone');
    expect(guestChat.payload.playerId).toBe(setup.hostPlayerId);
  });

  it('rejects non-host start request', async () => {
    const setup = await setupTwoPlayerLobby(url);
    clients.push(setup.host.socket, setup.guest.socket);

    send(setup.guest, {
      v: 1,
      type: 'lobby.start.request',
      payload: {
        lobbyId: setup.lobbyId,
        requestedByPlayerId: setup.guestPlayerId,
      },
    });

    const errorMessage = await waitForMessage(
      setup.guest,
      (message): message is ProtocolMessage & { type: 'lobby.error' } => message.type === 'lobby.error',
    );

    expect(errorMessage.payload.code).toBe('unauthorized');
  });

  it('starts lobby when host, min players, ready states and selected game are satisfied', async () => {
    const setup = await setupTwoPlayerLobby(url);
    clients.push(setup.host.socket, setup.guest.socket);

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

    const startAccepted = await waitForMessage(
      setup.host,
      (message): message is ProtocolMessage & { type: 'lobby.start.accepted' } =>
        message.type === 'lobby.start.accepted',
    );

    expect(startAccepted.payload.lobbyId).toBe(setup.lobbyId);
    expect(startAccepted.payload.gameId).toBe('bomberman');
    expect(startAccepted.payload.tickRate).toBe(20);

    const inGameState = await waitForMessage(
      setup.host,
      (message): message is LobbyStateMessage => message.type === 'lobby.state' && message.payload.phase === 'in_game',
    );

    expect(inGameState.payload.phase).toBe('in_game');
  });

  it('supports reconnect with valid token and rejects invalid/expired tokens', async () => {
    const setup = await setupTwoPlayerLobby(url);
    clients.push(setup.host.socket, setup.guest.socket);

    const oldGuestSocket = setup.guest.socket;
    oldGuestSocket.close();

    const disconnectedState = await waitForMessage(
      setup.host,
      (message): message is LobbyStateMessage =>
        message.type === 'lobby.state' &&
        message.payload.players.some(
          (player) => player.playerId === setup.guestPlayerId && player.isConnected === false,
        ),
    );

    expect(disconnectedState.payload.lobbyId).toBe(setup.lobbyId);

    const reconnectedGuest = await connectClient(url);
    clients.push(reconnectedGuest.socket);

    send(reconnectedGuest, {
      v: 1,
      type: 'lobby.join',
      payload: {
        lobbyId: setup.lobbyId,
        guestId: 'guest-2',
        nickname: 'Guest',
        sessionToken: setup.guestToken,
      },
    });

    const reconnectAuth = await waitForMessage(reconnectedGuest, isAuthIssued);
    expect(reconnectAuth.payload.playerId).toBe(setup.guestPlayerId);

    const reconnectedState = await waitForMessage(
      setup.host,
      (message): message is LobbyStateMessage =>
        message.type === 'lobby.state' &&
        message.payload.players.some(
          (player) => player.playerId === setup.guestPlayerId && player.isConnected === true,
        ),
    );
    expect(reconnectedState.payload.lobbyId).toBe(setup.lobbyId);

    const invalidClient = await connectClient(url);
    clients.push(invalidClient.socket);
    send(invalidClient, {
      v: 1,
      type: 'lobby.join',
      payload: {
        lobbyId: setup.lobbyId,
        guestId: 'guest-2',
        nickname: 'Guest',
        sessionToken: 'invalid.token',
      },
    });

    const invalidError = await waitForMessage(
      invalidClient,
      (message): message is ProtocolMessage & { type: 'lobby.error' } => message.type === 'lobby.error',
    );
    expect(invalidError.payload.code).toBe('invalid_session_token');

    const expiredClient = await connectClient(url);
    clients.push(expiredClient.socket);

    clock.advance(200);

    send(expiredClient, {
      v: 1,
      type: 'lobby.join',
      payload: {
        lobbyId: setup.lobbyId,
        guestId: 'guest-2',
        nickname: 'Guest',
        sessionToken: reconnectAuth.payload.sessionToken,
      },
    });

    const expiredError = await waitForMessage(
      expiredClient,
      (message): message is ProtocolMessage & { type: 'lobby.error' } => message.type === 'lobby.error',
    );
    expect(expiredError.payload.code).toBe('invalid_session_token');
  });
});
