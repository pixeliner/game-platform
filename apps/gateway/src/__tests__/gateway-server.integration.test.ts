import {
  decodeMessage,
  encodeMessage,
  type GameEventMessage,
  type GameJoinAcceptedMessage,
  type GameOverMessage,
  type GameSnapshotMessage,
  type LobbyAuthIssuedMessage,
  type LobbyErrorMessage,
  type LobbyStartAcceptedMessage,
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

async function closeClient(client: TestClient): Promise<void> {
  if (client.socket.readyState === WebSocket.CLOSED || client.socket.readyState === WebSocket.CLOSING) {
    return;
  }

  await new Promise<void>((resolve) => {
    client.socket.once('close', () => resolve());
    client.socket.close();
  });
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

function isGameJoinAccepted(message: ProtocolMessage): message is GameJoinAcceptedMessage {
  return message.type === 'game.join.accepted';
}

function isGameSnapshot(message: ProtocolMessage): message is GameSnapshotMessage {
  return message.type === 'game.snapshot';
}

function isGameEvent(message: ProtocolMessage): message is GameEventMessage {
  return message.type === 'game.event';
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

async function startBombermanRoom(setup: LobbySetup): Promise<LobbyStartAcceptedMessage> {
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

  const startAccepted = await waitForMessage(setup.host, isStartAccepted);
  await waitForMessage(
    setup.host,
    (message): message is LobbyStateMessage => isLobbyState(message) && message.payload.phase === 'in_game',
  );
  return startAccepted;
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
      sessionTtlMs: 1_000,
      reconnectGraceMs: 1_000,
      tickRate: 20,
      snapshotEveryTicks: 2,
      bombermanMovementModel: 'grid_smooth',
      roomIdleTimeoutMs: 100,
      sessionSecret: 'test-secret',
      sqlitePath: ':memory:',
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

    const errorMessage = await waitForMessage(setup.guest, isLobbyError);
    expect(errorMessage.payload.code).toBe('unauthorized');
  });

  it('starts lobby when host, min players, ready states and selected game are satisfied', async () => {
    const setup = await setupTwoPlayerLobby(url);
    clients.push(setup.host.socket, setup.guest.socket);

    const startAccepted = await startBombermanRoom(setup);
    expect(startAccepted.payload.lobbyId).toBe(setup.lobbyId);
    expect(startAccepted.payload.gameId).toBe('bomberman');
    expect(startAccepted.payload.tickRate).toBe(20);
  });

  it('supports reconnect with valid token and rejects invalid/expired tokens', async () => {
    const setup = await setupTwoPlayerLobby(url);
    clients.push(setup.host.socket, setup.guest.socket);

    await closeClient(setup.guest);

    const disconnectedState = await waitForMessage(
      setup.host,
      (message): message is LobbyStateMessage =>
        isLobbyState(message) &&
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
        isLobbyState(message) &&
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

    const invalidError = await waitForMessage(invalidClient, isLobbyError);
    expect(invalidError.payload.code).toBe('invalid_session_token');

    const expiredClient = await connectClient(url);
    clients.push(expiredClient.socket);
    clock.advance(1_100);

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

    const expiredError = await waitForMessage(expiredClient, isLobbyError);
    expect(expiredError.payload.code).toBe('invalid_session_token');
  });

  it('requires game.join before game.input', async () => {
    const setup = await setupTwoPlayerLobby(url);
    clients.push(setup.host.socket, setup.guest.socket);
    const startAccepted = await startBombermanRoom(setup);

    send(setup.host, {
      v: 1,
      type: 'game.input',
      payload: {
        roomId: startAccepted.payload.roomId,
        playerId: setup.hostPlayerId,
        tick: 1,
        input: {
          kind: 'move.intent',
          direction: 'left',
        },
      },
    });

    const error = await waitForMessage(setup.host, isLobbyError);
    expect(error.payload.code).toBe('unauthorized');
  });

  it('acknowledges game.join, sends initial snapshot, and emits events/snapshots from inputs', async () => {
    const setup = await setupTwoPlayerLobby(url);
    clients.push(setup.host.socket, setup.guest.socket);
    const startAccepted = await startBombermanRoom(setup);

    send(setup.host, {
      v: 1,
      type: 'game.join',
      payload: {
        roomId: startAccepted.payload.roomId,
        playerId: setup.hostPlayerId,
      },
    });

    const joinAccepted = await waitForMessage(setup.host, isGameJoinAccepted);
    expect(joinAccepted.payload.roomId).toBe(startAccepted.payload.roomId);
    expect(joinAccepted.payload.playerId).toBe(setup.hostPlayerId);

    const joinSnapshot = await waitForMessage(
      setup.host,
      (message): message is GameSnapshotMessage =>
        isGameSnapshot(message) &&
        message.payload.roomId === startAccepted.payload.roomId &&
        message.payload.tick === joinAccepted.payload.tick,
    );
    expect(joinSnapshot.payload.snapshot).toBeDefined();

    send(setup.host, {
      v: 1,
      type: 'game.input',
      payload: {
        roomId: startAccepted.payload.roomId,
        playerId: setup.hostPlayerId,
        tick: joinAccepted.payload.tick + 1,
        input: {
          kind: 'move.intent',
          direction: 'right',
        },
      },
    });

    const event = await waitForMessage(
      setup.host,
      (message): message is GameEventMessage =>
        isGameEvent(message) &&
        message.payload.roomId === startAccepted.payload.roomId &&
        (message.payload.event as { kind?: unknown }).kind === 'player.moved',
    );
    expect(event.payload.tick).toBeGreaterThanOrEqual(1);

    const periodicSnapshot = await waitForMessage(
      setup.host,
      (message): message is GameSnapshotMessage =>
        isGameSnapshot(message) &&
        message.payload.roomId === startAccepted.payload.roomId &&
        message.payload.tick >= 2,
    );
    expect(periodicSnapshot.payload.tick % 2).toBe(0);
  });

  it('returns lobby to waiting after game over and supports rematch start', async () => {
    const setup = await setupTwoPlayerLobby(url);
    clients.push(setup.host.socket, setup.guest.socket);
    const firstStart = await startBombermanRoom(setup);

    send(setup.host, {
      v: 1,
      type: 'game.join',
      payload: {
        roomId: firstStart.payload.roomId,
        playerId: setup.hostPlayerId,
      },
    });
    await waitForMessage(setup.host, isGameJoinAccepted);
    await waitForMessage(setup.host, isGameSnapshot);

    send(setup.guest, {
      v: 1,
      type: 'game.join',
      payload: {
        roomId: firstStart.payload.roomId,
        playerId: setup.guestPlayerId,
      },
    });
    await waitForMessage(setup.guest, isGameJoinAccepted);
    await waitForMessage(setup.guest, isGameSnapshot);

    send(setup.guest, {
      v: 1,
      type: 'game.input',
      payload: {
        roomId: firstStart.payload.roomId,
        playerId: setup.guestPlayerId,
        tick: 1,
        input: {
          kind: 'move.intent',
          direction: 'left',
        },
      },
    });
    send(setup.host, {
      v: 1,
      type: 'game.input',
      payload: {
        roomId: firstStart.payload.roomId,
        playerId: setup.hostPlayerId,
        tick: 2,
        input: {
          kind: 'bomb.place',
        },
      },
    });
    send(setup.host, {
      v: 1,
      type: 'game.input',
      payload: {
        roomId: firstStart.payload.roomId,
        playerId: setup.hostPlayerId,
        tick: 3,
        input: {
          kind: 'move.intent',
          direction: 'right',
        },
      },
    });
    send(setup.host, {
      v: 1,
      type: 'game.input',
      payload: {
        roomId: firstStart.payload.roomId,
        playerId: setup.hostPlayerId,
        tick: 4,
        input: {
          kind: 'move.intent',
          direction: null,
        },
      },
    });

    await waitForMessage(setup.host, isGameOver, 8_000);

    const waitingState = await waitForMessage(
      setup.host,
      (message): message is LobbyStateMessage =>
        isLobbyState(message) &&
        message.payload.lobbyId === setup.lobbyId &&
        message.payload.phase === 'waiting',
      8_000,
    );
    expect(waitingState.payload.players.filter((player) => player.isConnected).every((player) => !player.isReady)).toBe(
      true,
    );

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
    const rematchStart = await waitForMessage(setup.host, isStartAccepted);
    expect(rematchStart.payload.roomId).not.toBe(firstStart.payload.roomId);
  });

  it('stops idle rooms and rejects late game.join', async () => {
    const setup = await setupTwoPlayerLobby(url);
    clients.push(setup.host.socket, setup.guest.socket);
    const startAccepted = await startBombermanRoom(setup);

    send(setup.host, {
      v: 1,
      type: 'game.join',
      payload: {
        roomId: startAccepted.payload.roomId,
        playerId: setup.hostPlayerId,
      },
    });
    await waitForMessage(setup.host, isGameJoinAccepted);
    await waitForMessage(setup.host, isGameSnapshot);

    send(setup.guest, {
      v: 1,
      type: 'game.join',
      payload: {
        roomId: startAccepted.payload.roomId,
        playerId: setup.guestPlayerId,
      },
    });
    await waitForMessage(setup.guest, isGameJoinAccepted);
    await waitForMessage(setup.guest, isGameSnapshot);

    await closeClient(setup.host);
    await closeClient(setup.guest);
    await waitMs(160);

    const reconnectedHost = await connectClient(url);
    clients.push(reconnectedHost.socket);
    send(reconnectedHost, {
      v: 1,
      type: 'lobby.join',
      payload: {
        lobbyId: setup.lobbyId,
        guestId: 'guest-host',
        nickname: 'Host',
        sessionToken: setup.hostToken,
      },
    });
    await waitForMessage(reconnectedHost, isAuthIssued);

    send(reconnectedHost, {
      v: 1,
      type: 'game.join',
      payload: {
        roomId: startAccepted.payload.roomId,
        playerId: setup.hostPlayerId,
      },
    });

    const lateJoinError = await waitForMessage(reconnectedHost, isLobbyError);
    expect(lateJoinError.payload.code).toBe('invalid_state');
  });
});
