import {
  PROTOCOL_VERSION,
  type GameClientMessage,
  type ServerMessage,
} from '@game-platform/protocol';
import {
  createEngineRoomRuntime,
  type EngineRoomRuntime,
  type TickScheduler,
} from '@game-platform/engine';
import {
  GAME_ID_BOMBERMAN,
  type BombermanMovementModel,
} from '@game-platform/game-bomberman';

import { LobbyServiceError } from '../errors.js';
import type {
  Clock,
  ConnectionRegistry,
  GatewayConnectionContext,
  GatewayTransport,
  MatchPersistenceService,
} from '../types.js';
import type { ModuleRegistry } from './module-registry.js';
import type { RoomManager, RoomRecord } from './room-manager.js';

interface ActiveRoomRuntime {
  room: RoomRecord;
  runtime: EngineRoomRuntime<unknown>;
  joinedConnectionIds: Set<string>;
  connectedConnectionIds: Set<string>;
  spectatorConnectionIds: Set<string>;
  pendingGameOverEndedAtMs: number | undefined;
  idleTimeout: NodeJS.Timeout | undefined;
  stopped: boolean;
}

interface RoomRuntimeManagerDependencies {
  roomManager: RoomManager;
  moduleRegistry: ModuleRegistry;
  connectionRegistry: ConnectionRegistry;
  transport: GatewayTransport;
  clock: Clock;
  matchPersistenceService: MatchPersistenceService;
  snapshotEveryTicks: number;
  bombermanMovementModel: BombermanMovementModel;
  roomIdleTimeoutMs: number;
  onRoomStopped?: ((input: {
    lobbyId: string;
    roomId: string;
    reason: string;
    stoppedAtMs: number;
  }) => void) | undefined;
  createScheduler?: () => TickScheduler;
  setTimer?: (fn: () => void, ms: number) => NodeJS.Timeout;
  clearTimer?: (timeout: NodeJS.Timeout) => void;
}

function isValidGameResultEntry(value: unknown): value is { playerId: string; rank: number; score?: number } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as {
    playerId?: unknown;
    rank?: unknown;
    score?: unknown;
  };

  if (typeof candidate.playerId !== 'string' || candidate.playerId.length === 0) {
    return false;
  }

  if (typeof candidate.rank !== 'number' || !Number.isInteger(candidate.rank) || candidate.rank <= 0) {
    return false;
  }

  if (candidate.score !== undefined && !Number.isInteger(candidate.score)) {
    return false;
  }

  return true;
}

export class RoomRuntimeManager {
  private readonly roomManager: RoomManager;
  private readonly moduleRegistry: ModuleRegistry;
  private readonly connectionRegistry: ConnectionRegistry;
  private readonly transport: GatewayTransport;
  private readonly clock: Clock;
  private readonly matchPersistenceService: MatchPersistenceService;
  private readonly snapshotEveryTicks: number;
  private readonly bombermanMovementModel: BombermanMovementModel;
  private readonly roomIdleTimeoutMs: number;
  private readonly onRoomStopped: RoomRuntimeManagerDependencies['onRoomStopped'];
  private readonly createScheduler: (() => TickScheduler) | undefined;
  private readonly setTimer: (fn: () => void, ms: number) => NodeJS.Timeout;
  private readonly clearTimer: (timeout: NodeJS.Timeout) => void;
  private readonly runtimesByRoomId = new Map<string, ActiveRoomRuntime>();

  public constructor(dependencies: RoomRuntimeManagerDependencies) {
    this.roomManager = dependencies.roomManager;
    this.moduleRegistry = dependencies.moduleRegistry;
    this.connectionRegistry = dependencies.connectionRegistry;
    this.transport = dependencies.transport;
    this.clock = dependencies.clock;
    this.matchPersistenceService = dependencies.matchPersistenceService;
    this.snapshotEveryTicks = dependencies.snapshotEveryTicks;
    this.bombermanMovementModel = dependencies.bombermanMovementModel;
    this.roomIdleTimeoutMs = dependencies.roomIdleTimeoutMs;
    this.onRoomStopped = dependencies.onRoomStopped;
    this.createScheduler = dependencies.createScheduler;
    this.setTimer = dependencies.setTimer ?? setTimeout;
    this.clearTimer = dependencies.clearTimer ?? clearTimeout;
  }

  public startRoomRuntime(room: RoomRecord): void {
    if (room.status === 'stopped') {
      throw new LobbyServiceError('invalid_state', 'Cannot start runtime for stopped room.');
    }

    if (this.runtimesByRoomId.has(room.roomId)) {
      return;
    }

    const module = this.moduleRegistry.get(room.gameId);
    if (!module) {
      throw new LobbyServiceError('invalid_state', `No module registered for game ${room.gameId}.`);
    }

    const scheduler = this.createScheduler?.();
    const runtimeConfig =
      room.gameId === GAME_ID_BOMBERMAN
        ? {
            playerIds: [...room.playerIds],
            movementModel: this.bombermanMovementModel,
          }
        : {
            playerIds: [...room.playerIds],
          };

    const runtimeEntry: ActiveRoomRuntime = {
      room,
      runtime: createEngineRoomRuntime({
        roomId: room.roomId,
        gameId: room.gameId,
        seed: room.seed,
        tickRate: room.tickRate,
        snapshotEveryTicks: this.snapshotEveryTicks,
        config: runtimeConfig,
        module,
        ...(scheduler ? { scheduler } : {}),
        callbacks: {
          onSnapshot: (emission): void => {
            this.broadcastToSubscribers(runtimeEntry, {
              v: PROTOCOL_VERSION,
              type: 'game.snapshot',
              payload: {
                roomId: emission.roomId,
                gameId: emission.gameId,
                tick: emission.tick,
                snapshot: emission.snapshot,
              },
            });
          },

          onEvent: (emission): void => {
            this.broadcastToSubscribers(runtimeEntry, {
              v: PROTOCOL_VERSION,
              type: 'game.event',
              payload: {
                roomId: emission.roomId,
                gameId: emission.gameId,
                eventId: emission.eventId,
                tick: emission.tick,
                event: emission.event,
              },
            });
          },

          onGameOver: (emission): void => {
            const endedAtMs = this.clock.nowMs();
            runtimeEntry.pendingGameOverEndedAtMs = endedAtMs;
            try {
              const rawResults = Array.isArray(emission.results) ? emission.results : [];
              this.matchPersistenceService.persistCompletedMatch({
                room,
                endedAtMs,
                endReason: 'game_over',
                results: rawResults,
              });
            } catch (error) {
              console.error('Failed to persist completed match', {
                roomId: room.roomId,
                matchId: room.matchId,
                error,
              });
            }

            const results = Array.isArray(emission.results)
              ? emission.results.filter((item) => isValidGameResultEntry(item))
              : [];

            this.broadcastToSubscribers(runtimeEntry, {
              v: PROTOCOL_VERSION,
              type: 'game.over',
              payload: {
                roomId: emission.roomId,
                gameId: emission.gameId,
                endedAtMs,
                results,
              },
            });
          },

          onStopped: (emission): void => {
            this.markRoomStopped(runtimeEntry, emission.reason);
          },
        },
      }),
      joinedConnectionIds: new Set(),
      connectedConnectionIds: new Set(),
      spectatorConnectionIds: new Set(),
      pendingGameOverEndedAtMs: undefined,
      idleTimeout: undefined,
      stopped: false,
    };

    this.runtimesByRoomId.set(room.roomId, runtimeEntry);
    runtimeEntry.runtime.start();
  }

  public handleGameMessage(connectionId: string, message: GameClientMessage): void {
    switch (message.type) {
      case 'game.join':
        this.handleGameJoin(connectionId, message.payload.roomId, message.payload.playerId);
        return;
      case 'game.spectate.join':
        this.handleGameSpectateJoin(
          connectionId,
          message.payload.roomId,
          message.payload.guestId,
          message.payload.nickname,
        );
        return;
      case 'game.input':
        this.handleGameInput(connectionId, message.payload.roomId, message.payload.playerId, message.payload.tick, message.payload.input);
        return;
      case 'game.leave':
        this.handleGameLeave(connectionId, message.payload.roomId, message.payload.playerId);
        return;
    }
  }

  public handleConnectionClosed(connectionId: string, context?: GatewayConnectionContext): void {
    if (!context?.gameRoomId) {
      return;
    }

    const runtimeEntry = this.runtimesByRoomId.get(context.gameRoomId);
    if (!runtimeEntry) {
      return;
    }

    runtimeEntry.connectedConnectionIds.delete(connectionId);
    runtimeEntry.joinedConnectionIds.delete(connectionId);
    runtimeEntry.spectatorConnectionIds.delete(connectionId);

    this.evaluateIdleState(runtimeEntry);
  }

  public stopAll(reason = 'server_shutdown'): void {
    for (const runtimeEntry of this.runtimesByRoomId.values()) {
      runtimeEntry.runtime.stop(reason);
      this.clearIdleTimer(runtimeEntry);
    }
  }

  private handleGameJoin(connectionId: string, roomId: string, playerId: string): void {
    const context = this.connectionRegistry.get(connectionId);
    if (!context?.playerId) {
      throw new LobbyServiceError('unauthorized', 'Connection is not bound to a lobby player.');
    }

    if (context.playerId !== playerId) {
      throw new LobbyServiceError('unauthorized', 'game.join player does not match bound connection player.');
    }

    const room = this.roomManager.getRoom(roomId);
    if (!room || room.status === 'stopped') {
      throw new LobbyServiceError('invalid_state', 'Room is not active.');
    }

    if (!room.playerIds.includes(playerId)) {
      throw new LobbyServiceError('unauthorized', 'Player is not a participant in this room.');
    }

    const runtimeEntry = this.requireRuntimeEntry(roomId);
    if (runtimeEntry.stopped) {
      throw new LobbyServiceError('invalid_state', 'Room runtime has stopped.');
    }

    this.clearExistingRoomBinding(connectionId, context);
    runtimeEntry.joinedConnectionIds.add(connectionId);
    runtimeEntry.connectedConnectionIds.add(connectionId);
    this.clearIdleTimer(runtimeEntry);

    if (runtimeEntry.runtime.isPaused()) {
      runtimeEntry.runtime.resume();
    }

    this.connectionRegistry.patch(connectionId, {
      gameRoomId: roomId,
      gameSessionRole: 'player',
      spectatorId: undefined,
      spectatorGuestId: undefined,
      spectatorNickname: undefined,
    });

    this.transport.sendToConnection(connectionId, {
      v: PROTOCOL_VERSION,
      type: 'game.join.accepted',
      payload: {
        roomId,
        gameId: room.gameId,
        playerId,
        tick: runtimeEntry.runtime.getTick(),
        joinedAtMs: this.clock.nowMs(),
      },
    });

    this.transport.sendToConnection(connectionId, {
      v: PROTOCOL_VERSION,
      type: 'game.snapshot',
      payload: {
        roomId,
        gameId: room.gameId,
        tick: runtimeEntry.runtime.getTick(),
        snapshot: runtimeEntry.runtime.getLatestSnapshot(),
      },
    });
  }

  private handleGameSpectateJoin(
    connectionId: string,
    roomId: string,
    guestId: string,
    nickname: string,
  ): void {
    const room = this.roomManager.getRoom(roomId);
    if (!room || room.status === 'stopped') {
      throw new LobbyServiceError('invalid_state', 'Room is not active.');
    }

    const runtimeEntry = this.requireRuntimeEntry(roomId);
    if (runtimeEntry.stopped) {
      throw new LobbyServiceError('invalid_state', 'Room runtime has stopped.');
    }

    const context = this.connectionRegistry.get(connectionId);
    this.clearExistingRoomBinding(connectionId, context);

    const spectatorId =
      context?.gameSessionRole === 'spectator' && context.gameRoomId === roomId && context.spectatorId
        ? context.spectatorId
        : `spectator_${connectionId}`;

    runtimeEntry.spectatorConnectionIds.add(connectionId);
    this.connectionRegistry.patch(connectionId, {
      gameRoomId: roomId,
      gameSessionRole: 'spectator',
      spectatorId,
      spectatorGuestId: guestId,
      spectatorNickname: nickname,
    });

    this.transport.sendToConnection(connectionId, {
      v: PROTOCOL_VERSION,
      type: 'game.spectate.joined',
      payload: {
        roomId,
        gameId: room.gameId,
        spectatorId,
        tick: runtimeEntry.runtime.getTick(),
        joinedAtMs: this.clock.nowMs(),
      },
    });

    this.transport.sendToConnection(connectionId, {
      v: PROTOCOL_VERSION,
      type: 'game.snapshot',
      payload: {
        roomId,
        gameId: room.gameId,
        tick: runtimeEntry.runtime.getTick(),
        snapshot: runtimeEntry.runtime.getLatestSnapshot(),
      },
    });
  }

  private handleGameInput(
    connectionId: string,
    roomId: string,
    playerId: string,
    tick: number,
    input: unknown,
  ): void {
    const context = this.connectionRegistry.get(connectionId);
    if (!context?.playerId || context.playerId !== playerId) {
      throw new LobbyServiceError('unauthorized', 'game.input player does not match bound connection player.');
    }

    const runtimeEntry = this.requireRuntimeEntry(roomId);
    if (runtimeEntry.stopped) {
      throw new LobbyServiceError('invalid_state', 'Room runtime has stopped.');
    }

    if (context.gameRoomId !== roomId || !runtimeEntry.joinedConnectionIds.has(connectionId)) {
      throw new LobbyServiceError('unauthorized', 'Connection must join game room before sending input.');
    }

    runtimeEntry.connectedConnectionIds.add(connectionId);
    runtimeEntry.runtime.enqueueInput(playerId, tick, input);
  }

  private handleGameLeave(connectionId: string, roomId: string, playerId: string): void {
    const context = this.connectionRegistry.get(connectionId);
    if (!context?.playerId || context.playerId !== playerId) {
      throw new LobbyServiceError('unauthorized', 'game.leave player does not match bound connection player.');
    }

    const runtimeEntry = this.requireRuntimeEntry(roomId);
    runtimeEntry.connectedConnectionIds.delete(connectionId);
    runtimeEntry.joinedConnectionIds.delete(connectionId);

    this.connectionRegistry.patch(connectionId, {
      gameRoomId: undefined,
      gameSessionRole: undefined,
      spectatorId: undefined,
      spectatorGuestId: undefined,
      spectatorNickname: undefined,
    });

    this.evaluateIdleState(runtimeEntry);
  }

  private requireRuntimeEntry(roomId: string): ActiveRoomRuntime {
    const runtimeEntry = this.runtimesByRoomId.get(roomId);
    if (!runtimeEntry) {
      throw new LobbyServiceError('invalid_state', 'Room runtime is not available.');
    }

    return runtimeEntry;
  }

  private broadcastToSubscribers(runtimeEntry: ActiveRoomRuntime, message: ServerMessage): void {
    for (const connectionId of runtimeEntry.joinedConnectionIds) {
      this.transport.sendToConnection(connectionId, message);
    }
    for (const connectionId of runtimeEntry.spectatorConnectionIds) {
      this.transport.sendToConnection(connectionId, message);
    }
  }

  private clearExistingRoomBinding(
    connectionId: string,
    context: GatewayConnectionContext | undefined,
  ): void {
    const previousRoomId = context?.gameRoomId;
    if (!previousRoomId) {
      return;
    }

    const previousRuntimeEntry = this.runtimesByRoomId.get(previousRoomId);
    if (!previousRuntimeEntry) {
      return;
    }

    previousRuntimeEntry.connectedConnectionIds.delete(connectionId);
    previousRuntimeEntry.joinedConnectionIds.delete(connectionId);
    previousRuntimeEntry.spectatorConnectionIds.delete(connectionId);
    this.evaluateIdleState(previousRuntimeEntry);
  }

  private evaluateIdleState(runtimeEntry: ActiveRoomRuntime): void {
    if (runtimeEntry.stopped) {
      return;
    }

    if (runtimeEntry.connectedConnectionIds.size > 0) {
      this.clearIdleTimer(runtimeEntry);
      if (runtimeEntry.runtime.isPaused()) {
        runtimeEntry.runtime.resume();
      }
      return;
    }

    runtimeEntry.runtime.pause();

    if (runtimeEntry.idleTimeout) {
      return;
    }

    runtimeEntry.idleTimeout = this.setTimer(() => {
      runtimeEntry.idleTimeout = undefined;
      runtimeEntry.runtime.stop('idle_timeout');
    }, this.roomIdleTimeoutMs);
  }

  private clearIdleTimer(runtimeEntry: ActiveRoomRuntime): void {
    if (!runtimeEntry.idleTimeout) {
      return;
    }

    this.clearTimer(runtimeEntry.idleTimeout);
    runtimeEntry.idleTimeout = undefined;
  }

  private markRoomStopped(runtimeEntry: ActiveRoomRuntime, reason: string): void {
    if (runtimeEntry.stopped) {
      return;
    }

    const stoppedAtMs =
      reason === 'game_over' && runtimeEntry.pendingGameOverEndedAtMs !== undefined
        ? runtimeEntry.pendingGameOverEndedAtMs
        : this.clock.nowMs();

    runtimeEntry.stopped = true;
    runtimeEntry.pendingGameOverEndedAtMs = undefined;
    this.clearIdleTimer(runtimeEntry);
    this.roomManager.markStopped(runtimeEntry.room.roomId, stoppedAtMs);
    this.onRoomStopped?.({
      lobbyId: runtimeEntry.room.lobbyId,
      roomId: runtimeEntry.room.roomId,
      reason,
      stoppedAtMs,
    });
  }
}
