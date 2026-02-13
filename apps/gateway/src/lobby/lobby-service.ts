import {
  PROTOCOL_VERSION,
  type LobbyAdminAction,
  type LobbyAdminActionResultMessage,
  type LobbyAdminKickMessage,
  type LobbyAdminMonitorRequestMessage,
  type LobbyAdminRoomForceEndMessage,
  type LobbyAdminRoomPauseMessage,
  type LobbyAdminRoomResumeMessage,
  type LobbyAdminRoomStopMessage,
  type LobbyAdminStartForceMessage,
  type LobbyAdminTickRateSetMessage,
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
  LobbyPasswordService,
  RoomRuntimeManager,
  SessionTokenService,
} from '../types.js';
import type { LobbyStateMachine } from './lobby-state-machine.js';
import type { RoomManager, RoomRecord } from '../room/room-manager.js';

interface LobbyServiceDependencies {
  stateMachine: LobbyStateMachine;
  roomManager: RoomManager;
  sessionTokenService: SessionTokenService;
  roomRuntimeManager: RoomRuntimeManager;
  connectionRegistry: ConnectionRegistry;
  transport: GatewayTransport;
  idGenerator: IdGenerator;
  clock: Clock;
  lobbyPasswordService: LobbyPasswordService;
  lobbyMaxPlayers: number;
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
  private readonly roomRuntimeManager: RoomRuntimeManager;
  private readonly connectionRegistry: ConnectionRegistry;
  private readonly transport: GatewayTransport;
  private readonly idGenerator: IdGenerator;
  private readonly clock: Clock;
  private readonly lobbyPasswordService: LobbyPasswordService;
  private readonly lobbyMaxPlayers: number;
  private readonly reconnectGraceMs: number;
  private readonly defaultTickRate: number;
  private readonly setTimer: (fn: () => void, ms: number) => NodeJS.Timeout;
  private readonly clearTimer: (timeout: NodeJS.Timeout) => void;
  private readonly evictionTimers = new Map<string, NodeJS.Timeout>();

  public constructor(dependencies: LobbyServiceDependencies) {
    this.stateMachine = dependencies.stateMachine;
    this.roomManager = dependencies.roomManager;
    this.sessionTokenService = dependencies.sessionTokenService;
    this.roomRuntimeManager = dependencies.roomRuntimeManager;
    this.connectionRegistry = dependencies.connectionRegistry;
    this.transport = dependencies.transport;
    this.idGenerator = dependencies.idGenerator;
    this.clock = dependencies.clock;
    this.lobbyPasswordService = dependencies.lobbyPasswordService;
    this.lobbyMaxPlayers = dependencies.lobbyMaxPlayers;
    this.reconnectGraceMs = dependencies.reconnectGraceMs;
    this.defaultTickRate = dependencies.tickRate;
    this.setTimer = dependencies.setTimer ?? setTimeout;
    this.clearTimer = dependencies.clearTimer ?? clearTimeout;
  }

  public handleCreateLobby(connectionId: string, message: LobbyCreateMessage): void {
    this.ensureConnectionAvailable(connectionId);

    const nowMs = this.clock.nowMs();
    const lobbyId = this.idGenerator.next('lobby');
    const playerId = this.idGenerator.next('player');
    const passwordHash = message.payload.password
      ? this.lobbyPasswordService.hashPassword(message.payload.password)
      : null;

    this.stateMachine.createLobby({
      lobbyId,
      playerId,
      guestId: message.payload.guestId,
      nickname: message.payload.nickname,
      lobbyName: message.payload.lobbyName ?? 'LAN Session',
      maxPlayers: this.lobbyMaxPlayers,
      configuredTickRate: this.defaultTickRate,
      passwordHash,
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

    const lobby = this.stateMachine.getLobby(message.payload.lobbyId);
    if (!lobby) {
      throw new LobbyServiceError('lobby_not_found', 'Lobby was not found.', {
        lobbyId: message.payload.lobbyId,
      });
    }

    if (lobby.passwordHash) {
      if (
        !message.payload.password ||
        !this.lobbyPasswordService.verifyPassword(message.payload.password, lobby.passwordHash)
      ) {
        throw new LobbyServiceError('invalid_password', 'Lobby password is invalid.', {
          lobbyId: message.payload.lobbyId,
        });
      }
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
    this.roomRuntimeManager.evictPlayer(binding.lobbyId, binding.playerId);
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

    this.startLobbyRoom(lobby.lobbyId, gameId, nowMs);
  }

  public handleAdminMonitorRequest(connectionId: string, message: LobbyAdminMonitorRequestMessage): void {
    this.requireHostBinding(connectionId, message.payload.lobbyId, message.payload.requestedByPlayerId);

    this.transport.sendToConnection(connectionId, {
      v: PROTOCOL_VERSION,
      type: 'lobby.admin.monitor.state',
      payload: this.buildAdminMonitorPayload(message.payload.lobbyId),
    });
  }

  public handleAdminTickRateSet(connectionId: string, message: LobbyAdminTickRateSetMessage): void {
    this.requireHostBinding(connectionId, message.payload.lobbyId, message.payload.requestedByPlayerId);

    this.stateMachine.setConfiguredTickRate(
      message.payload.lobbyId,
      message.payload.tickRate,
      this.clock.nowMs(),
    );

    this.broadcastLobbyState(message.payload.lobbyId);
    this.sendAdminActionResult(connectionId, {
      lobbyId: message.payload.lobbyId,
      action: 'tick_rate.set',
      status: 'accepted',
      requestedByPlayerId: message.payload.requestedByPlayerId,
      tickRate: message.payload.tickRate,
      message: `Configured tick rate set to ${message.payload.tickRate}.`,
    });
  }

  public handleAdminKick(connectionId: string, message: LobbyAdminKickMessage): void {
    this.requireHostBinding(connectionId, message.payload.lobbyId, message.payload.requestedByPlayerId);

    if (message.payload.requestedByPlayerId === message.payload.targetPlayerId) {
      throw new LobbyServiceError('invalid_state', 'Host cannot kick themselves.', {
        lobbyId: message.payload.lobbyId,
      });
    }

    const lobby = this.requireLobby(message.payload.lobbyId);
    const targetPlayer = lobby.playersById.get(message.payload.targetPlayerId);
    if (!targetPlayer) {
      throw new LobbyServiceError('invalid_state', 'Kick target is not in this lobby.', {
        lobbyId: message.payload.lobbyId,
      });
    }

    const nowMs = this.clock.nowMs();
    this.cancelEviction(message.payload.targetPlayerId);
    this.roomRuntimeManager.evictPlayer(message.payload.lobbyId, message.payload.targetPlayerId);

    const targetConnection = this.connectionRegistry.findByPlayerId(message.payload.targetPlayerId);
    this.stateMachine.removePlayer(message.payload.lobbyId, message.payload.targetPlayerId, nowMs);

    if (targetConnection) {
      this.connectionRegistry.clear(targetConnection.connectionId);
      this.transport.closeConnection(targetConnection.connectionId, 4001, 'kicked_by_host');
    }

    this.broadcastLobbyState(message.payload.lobbyId);
    this.sendAdminActionResult(connectionId, {
      lobbyId: message.payload.lobbyId,
      action: 'kick',
      status: 'accepted',
      requestedByPlayerId: message.payload.requestedByPlayerId,
      targetPlayerId: message.payload.targetPlayerId,
      ...(message.payload.reason ? { reason: message.payload.reason } : {}),
      message: `Removed ${targetPlayer.nickname} from lobby.`,
    });
  }

  public handleAdminStartForce(connectionId: string, message: LobbyAdminStartForceMessage): void {
    this.requireHostBinding(connectionId, message.payload.lobbyId, message.payload.requestedByPlayerId);

    const nowMs = this.clock.nowMs();
    const { lobby, gameId } = this.stateMachine.requestStart({
      lobbyId: message.payload.lobbyId,
      requestedByPlayerId: message.payload.requestedByPlayerId,
      bypassReadiness: true,
      nowMs,
    });

    const room = this.startLobbyRoom(lobby.lobbyId, gameId, nowMs);

    this.sendAdminActionResult(connectionId, {
      lobbyId: message.payload.lobbyId,
      action: 'start.force',
      status: 'accepted',
      requestedByPlayerId: message.payload.requestedByPlayerId,
      roomId: room.roomId,
      message: 'Match force-started by host.',
    });
  }

  public handleAdminRoomPause(connectionId: string, message: LobbyAdminRoomPauseMessage): void {
    this.requireHostBinding(connectionId, message.payload.lobbyId, message.payload.requestedByPlayerId);
    this.ensureActiveRoom(message.payload.lobbyId, message.payload.roomId);

    this.roomRuntimeManager.pauseRoom(message.payload.lobbyId, message.payload.roomId);
    this.sendAdminActionResult(connectionId, {
      lobbyId: message.payload.lobbyId,
      action: 'room.pause',
      status: 'accepted',
      requestedByPlayerId: message.payload.requestedByPlayerId,
      roomId: message.payload.roomId,
      message: 'Room runtime paused.',
    });
  }

  public handleAdminRoomResume(connectionId: string, message: LobbyAdminRoomResumeMessage): void {
    this.requireHostBinding(connectionId, message.payload.lobbyId, message.payload.requestedByPlayerId);
    this.ensureActiveRoom(message.payload.lobbyId, message.payload.roomId);

    this.roomRuntimeManager.resumeRoom(message.payload.lobbyId, message.payload.roomId);
    this.sendAdminActionResult(connectionId, {
      lobbyId: message.payload.lobbyId,
      action: 'room.resume',
      status: 'accepted',
      requestedByPlayerId: message.payload.requestedByPlayerId,
      roomId: message.payload.roomId,
      message: 'Room runtime resumed.',
    });
  }

  public handleAdminRoomStop(connectionId: string, message: LobbyAdminRoomStopMessage): void {
    this.requireHostBinding(connectionId, message.payload.lobbyId, message.payload.requestedByPlayerId);
    this.ensureActiveRoom(message.payload.lobbyId, message.payload.roomId);

    this.roomRuntimeManager.stopRoom(message.payload.lobbyId, message.payload.roomId, 'admin_stop');
    this.sendAdminActionResult(connectionId, {
      lobbyId: message.payload.lobbyId,
      action: 'room.stop',
      status: 'accepted',
      requestedByPlayerId: message.payload.requestedByPlayerId,
      roomId: message.payload.roomId,
      ...(message.payload.reason ? { reason: message.payload.reason } : {}),
      message: message.payload.reason ? `Room stopped: ${message.payload.reason}` : 'Room stopped.',
    });
  }

  public handleAdminRoomForceEnd(connectionId: string, message: LobbyAdminRoomForceEndMessage): void {
    this.requireHostBinding(connectionId, message.payload.lobbyId, message.payload.requestedByPlayerId);
    this.ensureActiveRoom(message.payload.lobbyId, message.payload.roomId);

    this.roomRuntimeManager.forceEndRoom(message.payload.lobbyId, message.payload.roomId);
    this.sendAdminActionResult(connectionId, {
      lobbyId: message.payload.lobbyId,
      action: 'room.force_end',
      status: 'accepted',
      requestedByPlayerId: message.payload.requestedByPlayerId,
      roomId: message.payload.roomId,
      message: 'Room force-ended and persisted as admin_forced.',
    });
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

  public handleRoomRuntimeStateChanged(
    lobbyId: string,
    runtimeState: 'running' | 'paused' | 'stopped',
  ): void {
    const lobby = this.stateMachine.getLobby(lobbyId);
    if (!lobby || lobby.activeRoomId === null) {
      return;
    }

    const lobbyRuntimeState = runtimeState === 'stopped' ? null : runtimeState;
    this.stateMachine.setActiveRoomRuntimeState(lobbyId, lobbyRuntimeState, this.clock.nowMs());
    this.broadcastLobbyState(lobbyId);
  }

  public handleRoomStopped(lobbyId: string, reason: string): void {
    const lobby = this.stateMachine.getLobby(lobbyId);
    if (!lobby) {
      return;
    }

    if (reason !== 'game_over' && reason !== 'idle_timeout' && reason !== 'admin_stop' && reason !== 'admin_forced') {
      return;
    }

    this.stateMachine.setWaitingAfterGame(lobbyId, this.clock.nowMs());
    this.broadcastLobbyState(lobbyId);
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

  private requireHostBinding(
    connectionId: string,
    lobbyId: string,
    requestedByPlayerId: string,
  ): BoundConnection {
    const binding = this.requireBoundConnection(connectionId);
    if (binding.lobbyId !== lobbyId || binding.playerId !== requestedByPlayerId) {
      throw new LobbyServiceError('unauthorized', 'Admin requester does not match bound connection.', {
        lobbyId,
      });
    }

    const lobby = this.requireLobby(lobbyId);
    const player = lobby.playersById.get(requestedByPlayerId);
    if (!player || !player.isHost) {
      throw new LobbyServiceError('unauthorized', 'Only host can perform admin actions.', {
        lobbyId,
      });
    }

    return binding;
  }

  private requireLobby(lobbyId: string) {
    const lobby = this.stateMachine.getLobby(lobbyId);
    if (!lobby) {
      throw new LobbyServiceError('lobby_not_found', 'Lobby was not found.', { lobbyId });
    }

    return lobby;
  }

  private ensureActiveRoom(lobbyId: string, roomId: string): void {
    const lobby = this.requireLobby(lobbyId);
    if (lobby.phase !== 'in_game' || !lobby.activeRoomId || lobby.activeRoomId !== roomId) {
      throw new LobbyServiceError('invalid_state', 'Requested room is not currently active for this lobby.', {
        lobbyId,
      });
    }
  }

  private startLobbyRoom(lobbyId: string, gameId: string, nowMs: number): RoomRecord {
    const lobby = this.requireLobby(lobbyId);
    const connectedParticipants = [...lobby.playersById.values()]
      .filter((player) => player.isConnected)
      .map((player) => ({
        playerId: player.playerId,
        guestId: player.guestId,
        nickname: player.nickname,
      }));

    const room = this.roomManager.createRoom({
      matchId: this.idGenerator.next('match'),
      lobbyId: lobby.lobbyId,
      gameId,
      tickRate: lobby.configuredTickRate,
      createdAtMs: nowMs,
      startedAtMs: nowMs,
      participants: connectedParticipants,
    });

    this.roomRuntimeManager.startRoomRuntime(room);
    this.stateMachine.setInGame(lobby.lobbyId, room.roomId, nowMs);

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

    return room;
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

  private buildAdminMonitorPayload(lobbyId: string) {
    const lobby = this.requireLobby(lobbyId);
    let connectedPlayerCount = 0;
    for (const player of lobby.playersById.values()) {
      if (player.isConnected) {
        connectedPlayerCount += 1;
      }
    }

    const room = this.roomRuntimeManager.getLobbyMonitorState(lobbyId);

    return {
      lobbyId: lobby.lobbyId,
      generatedAtMs: this.clock.nowMs(),
      hostPlayerId: lobby.hostPlayerId,
      phase: lobby.phase,
      activeRoomId: lobby.activeRoomId,
      activeRoomRuntimeState: lobby.activeRoomRuntimeState,
      configuredTickRate: lobby.configuredTickRate,
      connectedPlayerCount,
      totalPlayerCount: lobby.playersById.size,
      room,
    };
  }

  private sendAdminActionResult(
    connectionId: string,
    input: {
      lobbyId: string;
      action: LobbyAdminAction;
      status: 'accepted' | 'rejected';
      requestedByPlayerId: string;
      roomId?: string;
      targetPlayerId?: string;
      tickRate?: number;
      reason?: string;
      message?: string;
      details?: unknown;
    },
  ): void {
    const payload: LobbyAdminActionResultMessage['payload'] = {
      lobbyId: input.lobbyId,
      action: input.action,
      status: input.status,
      requestedByPlayerId: input.requestedByPlayerId,
      atMs: this.clock.nowMs(),
      ...(input.roomId ? { roomId: input.roomId } : {}),
      ...(input.targetPlayerId ? { targetPlayerId: input.targetPlayerId } : {}),
      ...(input.tickRate ? { tickRate: input.tickRate } : {}),
      ...(input.reason ? { reason: input.reason } : {}),
      ...(input.message ? { message: input.message } : {}),
      ...(input.details !== undefined ? { details: input.details } : {}),
    };

    this.transport.sendToConnection(connectionId, {
      v: PROTOCOL_VERSION,
      type: 'lobby.admin.action.result',
      payload,
    });
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
      case 'lobby.admin.monitor.request':
        this.handleAdminMonitorRequest(connectionId, message);
        return;
      case 'lobby.admin.tick_rate.set':
        this.handleAdminTickRateSet(connectionId, message);
        return;
      case 'lobby.admin.kick':
        this.handleAdminKick(connectionId, message);
        return;
      case 'lobby.admin.start.force':
        this.handleAdminStartForce(connectionId, message);
        return;
      case 'lobby.admin.room.pause':
        this.handleAdminRoomPause(connectionId, message);
        return;
      case 'lobby.admin.room.resume':
        this.handleAdminRoomResume(connectionId, message);
        return;
      case 'lobby.admin.room.stop':
        this.handleAdminRoomStop(connectionId, message);
        return;
      case 'lobby.admin.room.force_end':
        this.handleAdminRoomForceEnd(connectionId, message);
        return;
    }
  }
}
