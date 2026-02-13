import {
  PROTOCOL_VERSION,
  type LobbyChatSendMessage,
  type LobbyClientMessage,
  type LobbyCreateMessage,
  type LobbyJoinMessage,
  type LobbyReadySetMessage,
  type LobbyServerMessage,
  type LobbyStartRequestMessage,
  type LobbyVoteCastMessage,
} from '@game-platform/protocol';

import { LobbyServiceError, type LobbyErrorCode } from '../errors.js';
import type {
  Clock,
  ConnectionRegistry,
  GatewayTransport,
  IdGenerator,
  SessionTokenService,
} from '../types.js';
import type { LobbyStateMachine } from './lobby-state-machine.js';
import type { RoomManager } from '../room/room-manager.js';

interface LobbyServiceDependencies {
  stateMachine: LobbyStateMachine;
  roomManager: RoomManager;
  sessionTokenService: SessionTokenService;
  connectionRegistry: ConnectionRegistry;
  transport: GatewayTransport;
  idGenerator: IdGenerator;
  clock: Clock;
  reconnectGraceMs: number;
  tickRate: number;
  setTimer?: (fn: () => void, ms: number) => NodeJS.Timeout;
  clearTimer?: (timeout: NodeJS.Timeout) => void;
}

interface BoundConnection {
  connectionId: string;
  lobbyId: string;
  playerId: string;
  guestId: string;
  nickname: string;
}

export class LobbyService {
  private readonly stateMachine: LobbyStateMachine;
  private readonly roomManager: RoomManager;
  private readonly sessionTokenService: SessionTokenService;
  private readonly connectionRegistry: ConnectionRegistry;
  private readonly transport: GatewayTransport;
  private readonly idGenerator: IdGenerator;
  private readonly clock: Clock;
  private readonly reconnectGraceMs: number;
  private readonly tickRate: number;
  private readonly setTimer: (fn: () => void, ms: number) => NodeJS.Timeout;
  private readonly clearTimer: (timeout: NodeJS.Timeout) => void;
  private readonly evictionTimers = new Map<string, NodeJS.Timeout>();

  public constructor(dependencies: LobbyServiceDependencies) {
    this.stateMachine = dependencies.stateMachine;
    this.roomManager = dependencies.roomManager;
    this.sessionTokenService = dependencies.sessionTokenService;
    this.connectionRegistry = dependencies.connectionRegistry;
    this.transport = dependencies.transport;
    this.idGenerator = dependencies.idGenerator;
    this.clock = dependencies.clock;
    this.reconnectGraceMs = dependencies.reconnectGraceMs;
    this.tickRate = dependencies.tickRate;
    this.setTimer = dependencies.setTimer ?? setTimeout;
    this.clearTimer = dependencies.clearTimer ?? clearTimeout;
  }

  public handleCreateLobby(connectionId: string, message: LobbyCreateMessage): void {
    this.ensureConnectionAvailable(connectionId);

    const nowMs = this.clock.nowMs();
    const lobbyId = this.idGenerator.next('lobby');
    const playerId = this.idGenerator.next('player');

    this.stateMachine.createLobby({
      lobbyId,
      playerId,
      guestId: message.payload.guestId,
      nickname: message.payload.nickname,
      nowMs,
    });

    this.connectionRegistry.patch(connectionId, {
      lobbyId,
      playerId,
      guestId: message.payload.guestId,
      nickname: message.payload.nickname,
    });

    this.cancelEviction(playerId);
    this.sendAuthIssued(connectionId, lobbyId, playerId, message.payload.guestId);
    this.broadcastLobbyState(lobbyId);
  }

  public handleJoinLobby(connectionId: string, message: LobbyJoinMessage): void {
    this.ensureConnectionAvailable(connectionId);

    const nowMs = this.clock.nowMs();
    const reconnectClaims =
      message.payload.sessionToken !== undefined
        ? this.sessionTokenService.verifySessionToken(message.payload.sessionToken)
        : null;

    if (message.payload.sessionToken !== undefined && reconnectClaims === null) {
      throw new LobbyServiceError('invalid_session_token', 'Reconnect token could not be validated.', {
        lobbyId: message.payload.lobbyId,
      });
    }

    if (reconnectClaims) {
      if (reconnectClaims.lobbyId !== message.payload.lobbyId || reconnectClaims.guestId !== message.payload.guestId) {
        throw new LobbyServiceError('invalid_session_token', 'Reconnect token does not match join request.', {
          lobbyId: message.payload.lobbyId,
        });
      }

      const existingContext = this.connectionRegistry.findByPlayerId(reconnectClaims.playerId);
      if (existingContext && existingContext.connectionId !== connectionId) {
        throw new LobbyServiceError('duplicate_connection', 'Player is already connected from another socket.', {
          lobbyId: message.payload.lobbyId,
        });
      }

      this.stateMachine.reconnectPlayer({
        lobbyId: reconnectClaims.lobbyId,
        playerId: reconnectClaims.playerId,
        guestId: reconnectClaims.guestId,
        nickname: message.payload.nickname,
        nowMs,
      });

      this.connectionRegistry.patch(connectionId, {
        lobbyId: reconnectClaims.lobbyId,
        playerId: reconnectClaims.playerId,
        guestId: reconnectClaims.guestId,
        nickname: message.payload.nickname,
      });

      this.cancelEviction(reconnectClaims.playerId);
      this.sendAuthIssued(
        connectionId,
        reconnectClaims.lobbyId,
        reconnectClaims.playerId,
        reconnectClaims.guestId,
      );
      this.broadcastLobbyState(reconnectClaims.lobbyId);
      return;
    }

    const playerId = this.idGenerator.next('player');
    this.stateMachine.joinLobby({
      lobbyId: message.payload.lobbyId,
      playerId,
      guestId: message.payload.guestId,
      nickname: message.payload.nickname,
      nowMs,
    });

    this.connectionRegistry.patch(connectionId, {
      lobbyId: message.payload.lobbyId,
      playerId,
      guestId: message.payload.guestId,
      nickname: message.payload.nickname,
    });

    this.cancelEviction(playerId);
    this.sendAuthIssued(connectionId, message.payload.lobbyId, playerId, message.payload.guestId);
    this.broadcastLobbyState(message.payload.lobbyId);
  }

  public handleLeaveLobby(connectionId: string, lobbyId: string, guestId: string): void {
    const binding = this.requireBoundConnection(connectionId);
    if (binding.lobbyId !== lobbyId || binding.guestId !== guestId) {
      throw new LobbyServiceError('unauthorized', 'Leave request does not match bound connection.', {
        lobbyId,
      });
    }

    const nowMs = this.clock.nowMs();
    this.cancelEviction(binding.playerId);
    const nextLobby = this.stateMachine.removePlayer(lobbyId, binding.playerId, nowMs);
    this.connectionRegistry.clear(connectionId);

    if (nextLobby) {
      this.broadcastLobbyState(lobbyId);
    }
  }

  public handleChatSend(connectionId: string, message: LobbyChatSendMessage): void {
    const binding = this.requireBoundConnection(connectionId);
    if (binding.lobbyId !== message.payload.lobbyId || binding.playerId !== message.payload.playerId) {
      throw new LobbyServiceError('unauthorized', 'Chat sender does not match bound connection.', {
        lobbyId: message.payload.lobbyId,
      });
    }

    const chatMessage: LobbyServerMessage = {
      v: PROTOCOL_VERSION,
      type: 'lobby.chat.message',
      payload: {
        lobbyId: binding.lobbyId,
        messageId: this.idGenerator.next('msg'),
        playerId: binding.playerId,
        nickname: binding.nickname,
        text: message.payload.text,
        sentAtMs: this.clock.nowMs(),
      },
    };

    this.transport.broadcastToLobby(binding.lobbyId, chatMessage);
  }

  public handleVoteCast(connectionId: string, message: LobbyVoteCastMessage): void {
    const binding = this.requireBoundConnection(connectionId);
    if (binding.lobbyId !== message.payload.lobbyId || binding.playerId !== message.payload.playerId) {
      throw new LobbyServiceError('unauthorized', 'Vote sender does not match bound connection.', {
        lobbyId: message.payload.lobbyId,
      });
    }

    this.stateMachine.castVote({
      lobbyId: binding.lobbyId,
      playerId: binding.playerId,
      gameId: message.payload.gameId,
      nowMs: this.clock.nowMs(),
    });

    this.broadcastLobbyState(binding.lobbyId);
  }

  public handleReadySet(connectionId: string, message: LobbyReadySetMessage): void {
    const binding = this.requireBoundConnection(connectionId);
    if (binding.lobbyId !== message.payload.lobbyId || binding.playerId !== message.payload.playerId) {
      throw new LobbyServiceError('unauthorized', 'Ready sender does not match bound connection.', {
        lobbyId: message.payload.lobbyId,
      });
    }

    this.stateMachine.setReady({
      lobbyId: binding.lobbyId,
      playerId: binding.playerId,
      isReady: message.payload.isReady,
      nowMs: this.clock.nowMs(),
    });

    this.broadcastLobbyState(binding.lobbyId);
  }

  public handleStartRequest(connectionId: string, message: LobbyStartRequestMessage): void {
    const binding = this.requireBoundConnection(connectionId);
    if (binding.lobbyId !== message.payload.lobbyId || binding.playerId !== message.payload.requestedByPlayerId) {
      throw new LobbyServiceError('unauthorized', 'Start requester does not match bound connection.', {
        lobbyId: message.payload.lobbyId,
      });
    }

    const nowMs = this.clock.nowMs();
    const { lobby, gameId } = this.stateMachine.requestStart({
      lobbyId: binding.lobbyId,
      requestedByPlayerId: binding.playerId,
      nowMs,
    });

    const connectedPlayerIds = [...lobby.playersById.values()]
      .filter((player) => player.isConnected)
      .map((player) => player.playerId);

    const room = this.roomManager.createRoom({
      lobbyId: lobby.lobbyId,
      gameId,
      tickRate: this.tickRate,
      createdAtMs: nowMs,
      playerIds: connectedPlayerIds,
    });

    this.stateMachine.setInGame(lobby.lobbyId, nowMs);

    const startAccepted: LobbyServerMessage = {
      v: PROTOCOL_VERSION,
      type: 'lobby.start.accepted',
      payload: {
        lobbyId: lobby.lobbyId,
        roomId: room.roomId,
        gameId: room.gameId,
        seed: room.seed,
        tickRate: room.tickRate,
        startedAtMs: nowMs,
      },
    };

    this.transport.broadcastToLobby(lobby.lobbyId, startAccepted);
    this.broadcastLobbyState(lobby.lobbyId);
  }

  public handleDisconnect(connectionId: string): void {
    const context = this.connectionRegistry.get(connectionId);
    this.connectionRegistry.clear(connectionId);

    if (!context?.lobbyId || !context.playerId) {
      return;
    }

    this.stateMachine.markDisconnected(context.lobbyId, context.playerId, this.clock.nowMs());
    this.broadcastLobbyState(context.lobbyId);
    this.scheduleEviction(context.lobbyId, context.playerId);
  }

  public sendInvalidMessage(connectionId: string, message: string, details?: unknown): void {
    this.sendError(connectionId, {
      code: 'invalid_message',
      message,
      details,
    });
  }

  public sendUnsupportedMessage(connectionId: string, messageType: string): void {
    this.sendError(connectionId, {
      code: 'unsupported_message',
      message: `Unsupported message type: ${messageType}`,
    });
  }

  public sendServiceError(connectionId: string, error: unknown): void {
    if (error instanceof LobbyServiceError) {
      const errorPayload: {
        code: LobbyErrorCode;
        message: string;
        lobbyId?: string;
        details?: unknown;
      } = {
        code: error.code,
        message: error.message,
      };

      if (error.lobbyId !== undefined) {
        errorPayload.lobbyId = error.lobbyId;
      }

      if (error.details !== undefined) {
        errorPayload.details = error.details;
      }

      this.sendError(connectionId, errorPayload);
      return;
    }

    this.sendError(connectionId, {
      code: 'invalid_state',
      message: 'Unexpected gateway error while processing message.',
    });
  }

  private ensureConnectionAvailable(connectionId: string): void {
    const context = this.connectionRegistry.get(connectionId);
    if (!context) {
      throw new LobbyServiceError('invalid_state', 'Connection is not registered.');
    }

    if (context.lobbyId || context.playerId) {
      throw new LobbyServiceError(
        'already_in_lobby',
        'Connection is already bound to a lobby.',
        context.lobbyId ? { lobbyId: context.lobbyId } : undefined,
      );
    }
  }

  private requireBoundConnection(connectionId: string): BoundConnection {
    const context = this.connectionRegistry.get(connectionId);
    if (!context || !context.lobbyId || !context.playerId || !context.guestId || !context.nickname) {
      throw new LobbyServiceError('unauthorized', 'Connection is not bound to a lobby player.');
    }

    return {
      connectionId: context.connectionId,
      lobbyId: context.lobbyId,
      playerId: context.playerId,
      guestId: context.guestId,
      nickname: context.nickname,
    };
  }

  private sendAuthIssued(connectionId: string, lobbyId: string, playerId: string, guestId: string): void {
    const token = this.sessionTokenService.issueSessionToken({
      lobbyId,
      playerId,
      guestId,
    });

    const message: LobbyServerMessage = {
      v: PROTOCOL_VERSION,
      type: 'lobby.auth.issued',
      payload: {
        lobbyId,
        playerId,
        guestId,
        sessionToken: token.sessionToken,
        expiresAtMs: token.expiresAtMs,
      },
    };

    this.transport.sendToConnection(connectionId, message);
  }

  private broadcastLobbyState(lobbyId: string): void {
    const lobby = this.stateMachine.getLobby(lobbyId);
    if (!lobby) {
      return;
    }

    const view = this.stateMachine.toLobbyView(lobby);
    const stateMessage: LobbyServerMessage = {
      v: PROTOCOL_VERSION,
      type: 'lobby.state',
      payload: view,
    };

    this.transport.broadcastToLobby(lobbyId, stateMessage);
  }

  private sendError(
    connectionId: string,
    input: {
      code: LobbyErrorCode;
      message: string;
      lobbyId?: string;
      details?: unknown;
    },
  ): void {
    const payload: {
      code: LobbyErrorCode;
      message: string;
      lobbyId?: string;
      details?: unknown;
    } = {
      code: input.code,
      message: input.message,
    };

    if (input.lobbyId !== undefined) {
      payload.lobbyId = input.lobbyId;
    }

    if (input.details !== undefined) {
      payload.details = input.details;
    }

    const errorMessage: LobbyServerMessage = {
      v: PROTOCOL_VERSION,
      type: 'lobby.error',
      payload,
    };

    this.transport.sendToConnection(connectionId, errorMessage);
  }

  private scheduleEviction(lobbyId: string, playerId: string): void {
    this.cancelEviction(playerId);

    const timeout = this.setTimer(() => {
      this.evictionTimers.delete(playerId);
      const updatedLobby = this.stateMachine.removePlayer(lobbyId, playerId, this.clock.nowMs());
      if (updatedLobby) {
        this.broadcastLobbyState(lobbyId);
      }
    }, this.reconnectGraceMs);

    this.evictionTimers.set(playerId, timeout);
  }

  private cancelEviction(playerId: string): void {
    const timeout = this.evictionTimers.get(playerId);
    if (!timeout) {
      return;
    }

    this.clearTimer(timeout);
    this.evictionTimers.delete(playerId);
  }

  public handleLobbyClientMessage(connectionId: string, message: LobbyClientMessage): void {
    switch (message.type) {
      case 'lobby.create':
        this.handleCreateLobby(connectionId, message);
        return;
      case 'lobby.join':
        this.handleJoinLobby(connectionId, message);
        return;
      case 'lobby.leave':
        this.handleLeaveLobby(connectionId, message.payload.lobbyId, message.payload.guestId);
        return;
      case 'lobby.chat.send':
        this.handleChatSend(connectionId, message);
        return;
      case 'lobby.vote.cast':
        this.handleVoteCast(connectionId, message);
        return;
      case 'lobby.ready.set':
        this.handleReadySet(connectionId, message);
        return;
      case 'lobby.start.request':
        this.handleStartRequest(connectionId, message);
        return;
    }
  }
}
