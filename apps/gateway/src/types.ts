import type {
  ClientMessage,
  LobbyClientMessage,
  LobbyServerMessage,
  ServerMessage,
} from '@game-platform/protocol';

export interface GatewayConnectionContext {
  connectionId: string;
  lobbyId?: string;
  playerId?: string;
  guestId?: string;
  nickname?: string;
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

export type LobbyMessageHandler = (connectionId: string, message: LobbyClientMessage) => void;
