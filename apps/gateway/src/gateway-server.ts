import { createServer } from 'node:http';

import {
  clientMessageSchema,
  encodeMessage,
  safeDecodeMessage,
} from '@game-platform/protocol';
import type { MatchRepository } from '@game-platform/storage';
import { WebSocket, WebSocketServer, type RawData } from 'ws';

import type { GatewayConfig } from './config.js';
import { createPersistenceApiHandler } from './http/persistence-api.js';
import type { LobbyStateMachine } from './lobby/lobby-state-machine.js';
import { LobbyService } from './lobby/lobby-service.js';
import { MatchPersistenceService } from './match/match-persistence.js';
import { GatewayMessageRouter } from './message-router.js';
import { createDefaultModuleRegistry } from './room/module-registry.js';
import type { RoomManager } from './room/room-manager.js';
import { RoomRuntimeManager } from './room/room-runtime-manager.js';
import type {
  Clock,
  ConnectionRegistry,
  GatewayConnectionContext,
  GatewayTransport,
  IdGenerator,
  SessionTokenService,
} from './types.js';

interface InternalConnection {
  socket: WebSocket;
  context: GatewayConnectionContext;
}

export interface CreateGatewayServerOptions {
  config: GatewayConfig;
  clock: Clock;
  idGenerator: IdGenerator;
  stateMachine: LobbyStateMachine;
  roomManager: RoomManager;
  sessionTokenService: SessionTokenService;
  matchRepository: MatchRepository;
}

export interface GatewayServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  getPort(): number;
  getWebSocketUrl(): string;
}

function rawDataToText(data: RawData): string {
  if (typeof data === 'string') {
    return data;
  }

  if (Buffer.isBuffer(data)) {
    return data.toString('utf8');
  }

  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString('utf8');
  }

  return Buffer.concat(data).toString('utf8');
}

export function createGatewayServer(options: CreateGatewayServerOptions): GatewayServer {
  const persistenceApi = createPersistenceApiHandler(options.matchRepository);
  const server = createServer((request, response) => {
    if (persistenceApi.handle(request, response)) {
      return;
    }

    const requestUrl = request.url ?? '/';
    const path = new URL(requestUrl, 'http://gateway.local').pathname;
    if (path === '/') {
      response.statusCode = 200;
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ ok: true }));
      return;
    }

    response.statusCode = 404;
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ error: { code: 'not_found', message: 'Route not found.' } }));
  });

  const webSocketServer = new WebSocketServer({ server, path: '/ws' });
  const connections = new Map<string, InternalConnection>();

  const connectionRegistry: ConnectionRegistry = {
    get(connectionId) {
      return connections.get(connectionId)?.context;
    },
    patch(connectionId, patch) {
      const entry = connections.get(connectionId);
      if (!entry) {
        return;
      }

      entry.context = {
        ...entry.context,
        ...patch,
      };
    },
    clear(connectionId) {
      const entry = connections.get(connectionId);
      if (!entry) {
        return;
      }

      entry.context = {
        connectionId,
      };
    },
    findByPlayerId(playerId) {
      for (const entry of connections.values()) {
        if (entry.context.playerId === playerId) {
          return entry.context;
        }
      }

      return undefined;
    },
    listByLobbyId(lobbyId) {
      const list: GatewayConnectionContext[] = [];
      for (const entry of connections.values()) {
        if (entry.context.lobbyId === lobbyId) {
          list.push(entry.context);
        }
      }
      return list;
    },
  };

  const transport: GatewayTransport = {
    sendToConnection(connectionId, message) {
      const entry = connections.get(connectionId);
      if (!entry || entry.socket.readyState !== WebSocket.OPEN) {
        return;
      }

      entry.socket.send(encodeMessage(message));
    },
    broadcastToLobby(lobbyId, message) {
      for (const entry of connections.values()) {
        if (entry.context.lobbyId !== lobbyId) {
          continue;
        }

        if (entry.socket.readyState !== WebSocket.OPEN) {
          continue;
        }

        entry.socket.send(encodeMessage(message));
      }
    },
  };

  const roomRuntimeManager = new RoomRuntimeManager({
    roomManager: options.roomManager,
    moduleRegistry: createDefaultModuleRegistry(),
    connectionRegistry,
    transport,
    clock: options.clock,
    matchPersistenceService: new MatchPersistenceService(options.matchRepository),
    snapshotEveryTicks: options.config.snapshotEveryTicks,
    roomIdleTimeoutMs: options.config.roomIdleTimeoutMs,
  });

  const lobbyService = new LobbyService({
    stateMachine: options.stateMachine,
    roomManager: options.roomManager,
    sessionTokenService: options.sessionTokenService,
    roomRuntimeManager,
    connectionRegistry,
    transport,
    idGenerator: options.idGenerator,
    clock: options.clock,
    reconnectGraceMs: options.config.reconnectGraceMs,
    tickRate: options.config.tickRate,
  });

  const router = new GatewayMessageRouter(lobbyService, roomRuntimeManager);

  webSocketServer.on('connection', (socket) => {
    const connectionId = options.idGenerator.next('conn');
    connections.set(connectionId, {
      socket,
      context: { connectionId },
    });

    socket.on('message', (raw, isBinary) => {
      if (isBinary) {
        lobbyService.sendInvalidMessage(connectionId, 'Binary messages are not supported.');
        return;
      }

      const decoded = safeDecodeMessage(rawDataToText(raw));
      if (!decoded.ok) {
        lobbyService.sendInvalidMessage(connectionId, decoded.error.message, {
          code: decoded.error.code,
          issues: decoded.error.issues,
        });
        return;
      }

      const clientMessageResult = clientMessageSchema.safeParse(decoded.value);
      if (!clientMessageResult.success) {
        lobbyService.sendInvalidMessage(connectionId, 'Only client message types are accepted.', {
          issues: clientMessageResult.error.issues,
        });
        return;
      }

      router.route(connectionId, clientMessageResult.data);
    });

    socket.on('close', () => {
      const context = connectionRegistry.get(connectionId);
      roomRuntimeManager.handleConnectionClosed(connectionId, context);
      lobbyService.handleDisconnect(connectionId);
      connections.delete(connectionId);
    });
  });

  return {
    start(): Promise<void> {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(options.config.port, options.config.host, () => {
          server.off('error', reject);
          resolve();
        });
      });
    },

    stop(): Promise<void> {
      return new Promise((resolve, reject) => {
        roomRuntimeManager.stopAll('server_shutdown');

        for (const connection of connections.values()) {
          connection.socket.close();
        }

        webSocketServer.close((wsError) => {
          if (wsError) {
            reject(wsError);
            return;
          }

          server.close((serverError) => {
            if (serverError) {
              reject(serverError);
              return;
            }

            options.matchRepository.close();

            resolve();
          });
        });
      });
    },

    getPort(): number {
      const address = server.address();
      if (!address || typeof address === 'string') {
        return options.config.port;
      }

      return address.port;
    },

    getWebSocketUrl(): string {
      return `ws://${options.config.host}:${this.getPort()}/ws`;
    },
  };
}
