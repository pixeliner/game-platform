import type {
  ClientMessage,
  GameClientMessage,
  LobbyClientMessage,
  LobbyServerMessage,
  ServerMessage,
} from '@game-platform/protocol';
import type { RoomRecord } from './room/room-manager.js';

export interface GatewayConnectionContext {
  connectionId: string;
  lobbyId?: string;
  playerId?: string;
  guestId?: string;
  nickname?: string;
  gameRoomId?: string | undefined;
  gameSessionRole?: 'player' | 'spectator' | undefined;
  spectatorId?: string | undefined;
  spectatorGuestId?: string | undefined;
  spectatorNickname?: string | undefined;
}

export interface ConnectionRegistry {
  get(connectionId: string): GatewayConnectionContext | undefined;
  patch(connectionId: string, patch: Partial<GatewayConnectionContext>): void;
  clear(connectionId: string): void;
  findByPlayerId(playerId: string): GatewayConnectionContext | undefined;
  listByLobbyId(lobbyId: string): GatewayConnectionContext[];
}

export interface GatewayTransport {
  sendToConnection(connectionId: string, message: ServerMessage): void;
  broadcastToLobby(lobbyId: string, message: LobbyServerMessage): void;
}

export interface IdGenerator {
  next(prefix: string): string;
}

export interface Clock {
  nowMs(): number;
}

export interface ReconnectClaims {
  lobbyId: string;
  playerId: string;
  guestId: string;
}

export interface IssuedSessionToken {
  sessionToken: string;
  expiresAtMs: number;
}

export interface SessionTokenService {
  issueSessionToken(input: ReconnectClaims): IssuedSessionToken;
  verifySessionToken(token: string): ReconnectClaims | null;
}

export interface MessageRouter {
  route(connectionId: string, message: ClientMessage): void;
}

export interface RoomRuntimeManager {
  startRoomRuntime(room: RoomRecord): void;
  handleGameMessage(connectionId: string, message: GameClientMessage): void;
  handleConnectionClosed(connectionId: string, context?: GatewayConnectionContext): void;
  stopAll(reason?: string): void;
}

export interface MatchPersistenceService {
  persistCompletedMatch(input: {
    room: RoomRecord;
    endedAtMs: number;
    endReason: string;
    results: unknown[];
  }): void;
}

export type LobbyMessageHandler = (connectionId: string, message: LobbyClientMessage) => void;
