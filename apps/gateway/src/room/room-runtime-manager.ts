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
  LobbyMonitorRoomState,
  MatchPersistenceService,
} from '../types.js';
import type { ModuleRegistry } from './module-registry.js';
import type { RoomManager, RoomRecord } from './room-manager.js';

type RuntimeState = 'running' | 'paused' | 'stopped';

interface ActiveRoomRuntime {
  room: RoomRecord;
  runtime: EngineRoomRuntime<unknown>;
  joinedConnectionIds: Set<string>;
  connectedConnectionIds: Set<string>;
  spectatorConnectionIds: Set<string>;
  eliminationTickByPlayerId: Map<string, number>;
  aliveByPlayerId: Map<string, boolean>;
  pendingGameOverEndedAtMs: number | undefined;
  idleTimeout: NodeJS.Timeout | undefined;
  stopped: boolean;
  runtimeState: RuntimeState;
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
  onRoomRuntimeStateChanged?: ((input: {
    lobbyId: string;
    roomId: string;
    runtimeState: RuntimeState;
    atMs: number;
  }) => void) | undefined;
  createScheduler?: () => TickScheduler;
  setTimer?: (fn: () => void, ms: number) => NodeJS.Timeout;
  clearTimer?: (timeout: NodeJS.Timeout) => void;
}

interface PersistableResult {
  playerId: string;
  rank: number;
  score: number;
  alive: boolean;
  eliminatedAtTick: number | null;
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

function isPlayerEliminatedEvent(value: unknown): value is { kind: 'player.eliminated'; playerId: string } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as {
    kind?: unknown;
    playerId?: unknown;
  };

  return candidate.kind === 'player.eliminated' && typeof candidate.playerId === 'string' && candidate.playerId.length > 0;
}

function isPlayerSnapshotArray(value: unknown): value is Array<{ playerId: string; alive: boolean }> {
  if (!Array.isArray(value)) {
    return false;
  }

  for (const item of value) {
    if (typeof item !== 'object' || item === null) {
      return false;
    }

    const candidate = item as {
      playerId?: unknown;
      alive?: unknown;
    };

    if (typeof candidate.playerId !== 'string' || typeof candidate.alive !== 'boolean') {
      return false;
    }
  }

  return true;
}

function getPlayersFromSnapshot(snapshot: unknown): Array<{ playerId: string; alive: boolean }> {
  if (typeof snapshot !== 'object' || snapshot === null || !('players' in snapshot)) {
    return [];
  }

  const players = (snapshot as { players?: unknown }).players;
  return isPlayerSnapshotArray(players) ? players : [];
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
  private readonly onRoomRuntimeStateChanged: RoomRuntimeManagerDependencies['onRoomRuntimeStateChanged'];
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
    this.onRoomRuntimeStateChanged = dependencies.onRoomRuntimeStateChanged;
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
            const snapshotPlayers = getPlayersFromSnapshot(emission.snapshot);
            for (const player of snapshotPlayers) {
              runtimeEntry.aliveByPlayerId.set(player.playerId, player.alive);
            }

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
            if (isPlayerEliminatedEvent(emission.event) && !runtimeEntry.eliminationTickByPlayerId.has(emission.event.playerId)) {
              runtimeEntry.eliminationTickByPlayerId.set(emission.event.playerId, emission.tick);
              runtimeEntry.aliveByPlayerId.set(emission.event.playerId, false);
            }

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

            this.broadcastGameOver(runtimeEntry, endedAtMs, results);
          },

          onStopped: (emission): void => {
            this.markRoomStopped(runtimeEntry, emission.reason);
          },
        },
      }),
      joinedConnectionIds: new Set(),
      connectedConnectionIds: new Set(),
      spectatorConnectionIds: new Set(),
      eliminationTickByPlayerId: new Map(),
      aliveByPlayerId: new Map(room.playerIds.map((playerId) => [playerId, true])),
      pendingGameOverEndedAtMs: undefined,
      idleTimeout: undefined,
      stopped: false,
      runtimeState: 'running',
    };

    this.runtimesByRoomId.set(room.roomId, runtimeEntry);
    runtimeEntry.runtime.start();
    this.setRuntimeState(runtimeEntry, 'running');
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

  public pauseRoom(lobbyId: string, roomId: string): void {
    const runtimeEntry = this.requireControllableRuntime(lobbyId, roomId);
    runtimeEntry.runtime.pause();
    this.clearIdleTimer(runtimeEntry);
    this.setRuntimeState(runtimeEntry, 'paused');
  }

  public resumeRoom(lobbyId: string, roomId: string): void {
    const runtimeEntry = this.requireControllableRuntime(lobbyId, roomId);
    runtimeEntry.runtime.resume();
    this.setRuntimeState(runtimeEntry, runtimeEntry.runtime.isPaused() ? 'paused' : 'running');
    this.evaluateIdleState(runtimeEntry);
  }

  public stopRoom(lobbyId: string, roomId: string, reason = 'admin_stop'): void {
    const runtimeEntry = this.requireControllableRuntime(lobbyId, roomId);
    runtimeEntry.runtime.stop(reason);
  }

  public forceEndRoom(lobbyId: string, roomId: string): void {
    const runtimeEntry = this.requireControllableRuntime(lobbyId, roomId);
    const endedAtMs = this.clock.nowMs();
    runtimeEntry.pendingGameOverEndedAtMs = endedAtMs;

    const persistableResults = this.buildForcedResults(runtimeEntry);

    try {
      this.matchPersistenceService.persistCompletedMatch({
        room: runtimeEntry.room,
        endedAtMs,
        endReason: 'admin_forced',
        results: persistableResults,
      });
    } catch (error) {
      console.error('Failed to persist admin forced match result', {
        roomId: runtimeEntry.room.roomId,
        matchId: runtimeEntry.room.matchId,
        error,
      });
    }

    const publicResults = persistableResults.map((result) => ({
      playerId: result.playerId,
      rank: result.rank,
      score: result.score,
    }));

    this.broadcastGameOver(runtimeEntry, endedAtMs, publicResults);
    runtimeEntry.runtime.stop('admin_forced');
  }

  public evictPlayer(lobbyId: string, playerId: string): void {
    for (const runtimeEntry of this.runtimesByRoomId.values()) {
      if (runtimeEntry.room.lobbyId !== lobbyId || runtimeEntry.stopped) {
        continue;
      }

      const relatedConnectionIds = new Set<string>([
        ...runtimeEntry.joinedConnectionIds,
        ...runtimeEntry.connectedConnectionIds,
      ]);

      let didEvict = false;
      for (const connectionId of relatedConnectionIds) {
        const context = this.connectionRegistry.get(connectionId);
        if (!context || context.playerId !== playerId) {
          continue;
        }

        runtimeEntry.connectedConnectionIds.delete(connectionId);
        runtimeEntry.joinedConnectionIds.delete(connectionId);
        this.connectionRegistry.patch(connectionId, {
          gameRoomId: undefined,
          gameSessionRole: undefined,
          spectatorId: undefined,
          spectatorGuestId: undefined,
          spectatorNickname: undefined,
        });
        didEvict = true;
      }

      if (didEvict) {
        this.evaluateIdleState(runtimeEntry);
      }
    }
  }

  public getLobbyMonitorState(lobbyId: string): LobbyMonitorRoomState | null {
    const roomRuntimes = [...this.runtimesByRoomId.values()]
      .filter((entry) => entry.room.lobbyId === lobbyId && !entry.stopped)
      .sort((a, b) => b.room.startedAtMs - a.room.startedAtMs);

    const runtimeEntry = roomRuntimes.at(0);
    if (!runtimeEntry) {
      return null;
    }

    return {
      roomId: runtimeEntry.room.roomId,
      gameId: runtimeEntry.room.gameId,
      tickRate: runtimeEntry.room.tickRate,
      tick: runtimeEntry.runtime.getTick(),
      runtimeState: runtimeEntry.runtimeState,
      participantCount: runtimeEntry.room.playerIds.length,
      connectedParticipantCount: runtimeEntry.connectedConnectionIds.size,
      spectatorCount: runtimeEntry.spectatorConnectionIds.size,
      startedAtMs: runtimeEntry.room.startedAtMs,
    };
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
      this.setRuntimeState(runtimeEntry, 'running');
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

  private requireControllableRuntime(lobbyId: string, roomId: string): ActiveRoomRuntime {
    const runtimeEntry = this.requireRuntimeEntry(roomId);
    if (runtimeEntry.room.lobbyId !== lobbyId) {
      throw new LobbyServiceError('invalid_state', 'Room is not associated with lobby.');
    }

    if (runtimeEntry.stopped) {
      throw new LobbyServiceError('invalid_state', 'Room runtime has stopped.');
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

  private broadcastGameOver(
    runtimeEntry: ActiveRoomRuntime,
    endedAtMs: number,
    results: Array<{ playerId: string; rank: number; score?: number }>,
  ): void {
    this.broadcastToSubscribers(runtimeEntry, {
      v: PROTOCOL_VERSION,
      type: 'game.over',
      payload: {
        roomId: runtimeEntry.room.roomId,
        gameId: runtimeEntry.room.gameId,
        endedAtMs,
        results,
      },
    });
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
      this.setRuntimeState(runtimeEntry, 'running');
      return;
    }

    runtimeEntry.runtime.pause();
    this.setRuntimeState(runtimeEntry, 'paused');

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
      (reason === 'game_over' || reason === 'admin_forced') && runtimeEntry.pendingGameOverEndedAtMs !== undefined
        ? runtimeEntry.pendingGameOverEndedAtMs
        : this.clock.nowMs();

    runtimeEntry.stopped = true;
    runtimeEntry.pendingGameOverEndedAtMs = undefined;
    this.clearIdleTimer(runtimeEntry);
    this.setRuntimeState(runtimeEntry, 'stopped');
    this.roomManager.markStopped(runtimeEntry.room.roomId, stoppedAtMs);
    this.onRoomStopped?.({
      lobbyId: runtimeEntry.room.lobbyId,
      roomId: runtimeEntry.room.roomId,
      reason,
      stoppedAtMs,
    });
  }

  private setRuntimeState(runtimeEntry: ActiveRoomRuntime, runtimeState: RuntimeState): void {
    if (runtimeEntry.runtimeState === runtimeState) {
      return;
    }

    runtimeEntry.runtimeState = runtimeState;
    this.onRoomRuntimeStateChanged?.({
      lobbyId: runtimeEntry.room.lobbyId,
      roomId: runtimeEntry.room.roomId,
      runtimeState,
      atMs: this.clock.nowMs(),
    });
  }

  private buildForcedResults(runtimeEntry: ActiveRoomRuntime): PersistableResult[] {
    const playerStates = runtimeEntry.room.playerIds.map((playerId) => {
      const eliminatedAtTick = runtimeEntry.eliminationTickByPlayerId.get(playerId) ?? null;
      const aliveFromSnapshot = runtimeEntry.aliveByPlayerId.get(playerId);
      const alive = aliveFromSnapshot ?? eliminatedAtTick === null;

      return {
        playerId,
        alive,
        eliminatedAtTick,
      };
    });

    const sorted = playerStates.sort((a, b) => {
      if (a.alive !== b.alive) {
        return a.alive ? -1 : 1;
      }

      const aTick = a.eliminatedAtTick ?? Number.MAX_SAFE_INTEGER;
      const bTick = b.eliminatedAtTick ?? Number.MAX_SAFE_INTEGER;
      if (aTick !== bTick) {
        return bTick - aTick;
      }

      return a.playerId.localeCompare(b.playerId);
    });

    return sorted.map((player, index) => {
      const rank = index + 1;
      return {
        playerId: player.playerId,
        rank,
        score: Math.max(0, sorted.length - rank),
        alive: player.alive,
        eliminatedAtTick: player.eliminatedAtTick,
      };
    });
  }
}
