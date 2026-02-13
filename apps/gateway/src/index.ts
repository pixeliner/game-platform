import { createSessionTokenService } from './auth/session-token-service.js';
import { loadGatewayConfig, type GatewayConfig } from './config.js';
import {
  createGatewayServer as createGatewayServerRuntime,
  type CreateGatewayServerOptions,
  type GatewayServer,
} from './gateway-server.js';
import { LobbyStateMachine } from './lobby/lobby-state-machine.js';
import { RoomManager } from './room/room-manager.js';
import type { Clock, IdGenerator, SessionTokenService } from './types.js';
import { createSystemClock } from './utils/clock.js';
import { createIdGenerator } from './utils/id-generator.js';

export type { GatewayConfig };
export type { GatewayServer };

export interface GatewayFactoryOptions {
  config?: GatewayConfig;
  clock?: Clock;
  idGenerator?: IdGenerator;
  stateMachine?: LobbyStateMachine;
  roomManager?: RoomManager;
  sessionTokenService?: SessionTokenService;
}

export function createGatewayServer(options: GatewayFactoryOptions = {}): GatewayServer {
  const config = options.config ?? loadGatewayConfig();
  const clock = options.clock ?? createSystemClock();
  const idGenerator = options.idGenerator ?? createIdGenerator();
  const stateMachine = options.stateMachine ?? new LobbyStateMachine();
  const roomManager = options.roomManager ?? new RoomManager({
    nextRoomId: () => idGenerator.next('room'),
  });
  const sessionTokenService =
    options.sessionTokenService ??
    createSessionTokenService({
      secret: config.sessionSecret,
      ttlMs: config.sessionTtlMs,
      nowMs: () => clock.nowMs(),
      nextSessionId: () => idGenerator.next('sid'),
    });

  const gatewayOptions: CreateGatewayServerOptions = {
    config,
    clock,
    idGenerator,
    stateMachine,
    roomManager,
    sessionTokenService,
  };

  return createGatewayServerRuntime(gatewayOptions);
}

export { loadGatewayConfig };
