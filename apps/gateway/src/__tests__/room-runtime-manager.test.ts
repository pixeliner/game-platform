import { describe, expect, it } from 'vitest';

import type { LobbyServerMessage, ServerMessage } from '@game-platform/protocol';
import type { TickScheduler } from '@game-platform/engine';

import { LobbyServiceError } from '../errors.js';
import { createDefaultModuleRegistry } from '../room/module-registry.js';
import { RoomManager } from '../room/room-manager.js';
import { RoomRuntimeManager } from '../room/room-runtime-manager.js';
import type { ConnectionRegistry, GatewayConnectionContext, GatewayTransport } from '../types.js';

class ManualScheduler implements TickScheduler {
  private onTick: (() => void) | undefined;
  private running = false;

  public start(_intervalMs: number, onTick: () => void): void {
    this.running = true;
    this.onTick = onTick;
  }

  public stop(): void {
    this.running = false;
  }

  public isRunning(): boolean {
    return this.running;
  }

  public advance(ticks: number): void {
    if (!this.onTick || !this.running) {
      return;
    }

    for (let index = 0; index < ticks; index += 1) {
      if (!this.running) {
        return;
      }
      this.onTick();
    }
  }
}

class FakeConnectionRegistry implements ConnectionRegistry {
  private readonly contexts = new Map<string, GatewayConnectionContext>();

  public get(connectionId: string): GatewayConnectionContext | undefined {
    return this.contexts.get(connectionId);
  }

  public patch(connectionId: string, patch: Partial<GatewayConnectionContext>): void {
    const current = this.contexts.get(connectionId) ?? { connectionId };
    this.contexts.set(connectionId, {
      ...current,
      ...patch,
    });
  }

  public clear(connectionId: string): void {
    this.contexts.set(connectionId, {
      connectionId,
    });
  }

  public findByPlayerId(playerId: string): GatewayConnectionContext | undefined {
    for (const context of this.contexts.values()) {
      if (context.playerId === playerId) {
        return context;
      }
    }
    return undefined;
  }

  public listByLobbyId(lobbyId: string): GatewayConnectionContext[] {
    return [...this.contexts.values()].filter((context) => context.lobbyId === lobbyId);
  }

  public setContext(context: GatewayConnectionContext): void {
    this.contexts.set(context.connectionId, context);
  }
}

class FakeTransport implements GatewayTransport {
  private readonly messagesByConnectionId = new Map<string, ServerMessage[]>();

  public sendToConnection(connectionId: string, message: ServerMessage): void {
    const existing = this.messagesByConnectionId.get(connectionId) ?? [];
    existing.push(message);
    this.messagesByConnectionId.set(connectionId, existing);
  }

  public broadcastToLobby(_lobbyId: string, _message: LobbyServerMessage): void {
    // Not used by RoomRuntimeManager.
  }

  public findByType<TType extends ServerMessage['type']>(
    connectionId: string,
    type: TType,
  ): Extract<ServerMessage, { type: TType }> | undefined {
    return this.messagesByConnectionId
      .get(connectionId)
      ?.find((message): message is Extract<ServerMessage, { type: TType }> => message.type === type);
  }
}

class FakeTimerController {
  private nextTimerId = 1;
  private readonly callbacks = new Map<number, () => void>();

  public setTimer = (callback: () => void): NodeJS.Timeout => {
    const timerId = this.nextTimerId;
    this.nextTimerId += 1;
    this.callbacks.set(timerId, callback);
    return timerId as unknown as NodeJS.Timeout;
  };

  public clearTimer = (timeout: NodeJS.Timeout): void => {
    this.callbacks.delete(timeout as unknown as number);
  };

  public fireAll(): void {
    const entries = [...this.callbacks.entries()];
    this.callbacks.clear();

    for (const [, callback] of entries) {
      callback();
    }
  }

  public size(): number {
    return this.callbacks.size;
  }
}

describe('RoomRuntimeManager', () => {
  function setupHarness() {
    const roomManager = new RoomManager({
      nextRoomId: () => 'room-1',
      nextSeed: () => 11,
    });
    const moduleRegistry = createDefaultModuleRegistry();
    const connectionRegistry = new FakeConnectionRegistry();
    const transport = new FakeTransport();
    const scheduler = new ManualScheduler();
    const timers = new FakeTimerController();

    const manager = new RoomRuntimeManager({
      roomManager,
      moduleRegistry,
      connectionRegistry,
      transport,
      clock: {
        nowMs: () => 1_700_000_000_000,
      },
      snapshotEveryTicks: 2,
      roomIdleTimeoutMs: 30_000,
      createScheduler: () => scheduler,
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
    });

    const room = roomManager.createRoom({
      lobbyId: 'lobby-1',
      gameId: 'bomberman',
      tickRate: 20,
      createdAtMs: 1_700_000_000_000,
      playerIds: ['player-1', 'player-2'],
    });

    manager.startRoomRuntime(room);

    return {
      manager,
      roomManager,
      connectionRegistry,
      transport,
      scheduler,
      timers,
      roomId: room.roomId,
    };
  }

  it('requires game.join before accepting game.input and sends join accepted + snapshot', () => {
    const harness = setupHarness();
    harness.connectionRegistry.setContext({
      connectionId: 'conn-1',
      lobbyId: 'lobby-1',
      playerId: 'player-1',
      guestId: 'guest-1',
      nickname: 'Host',
    });

    expect(() =>
      harness.manager.handleGameMessage('conn-1', {
        v: 1,
        type: 'game.input',
        payload: {
          roomId: harness.roomId,
          playerId: 'player-1',
          tick: 1,
          input: {
            kind: 'move.intent',
            direction: 'left',
          },
        },
      }),
    ).toThrow(LobbyServiceError);

    harness.manager.handleGameMessage('conn-1', {
      v: 1,
      type: 'game.join',
      payload: {
        roomId: harness.roomId,
        playerId: 'player-1',
      },
    });

    const joinAccepted = harness.transport.findByType('conn-1', 'game.join.accepted');
    const initialSnapshot = harness.transport.findByType('conn-1', 'game.snapshot');

    expect(joinAccepted?.payload.roomId).toBe(harness.roomId);
    expect(joinAccepted?.payload.gameId).toBe('bomberman');
    expect(initialSnapshot?.payload.tick).toBe(0);
  });

  it('emits game events from accepted inputs after join', () => {
    const harness = setupHarness();
    harness.connectionRegistry.setContext({
      connectionId: 'conn-1',
      lobbyId: 'lobby-1',
      playerId: 'player-1',
      guestId: 'guest-1',
      nickname: 'Host',
    });

    harness.manager.handleGameMessage('conn-1', {
      v: 1,
      type: 'game.join',
      payload: {
        roomId: harness.roomId,
        playerId: 'player-1',
      },
    });

    harness.manager.handleGameMessage('conn-1', {
      v: 1,
      type: 'game.input',
      payload: {
        roomId: harness.roomId,
        playerId: 'player-1',
        tick: 1,
        input: {
          kind: 'move.intent',
          direction: 'right',
        },
      },
    });

    harness.scheduler.advance(1);

    const eventMessage = harness.transport.findByType('conn-1', 'game.event');
    expect(eventMessage?.payload.event).toEqual({
      kind: 'player.moved',
      playerId: 'player-1',
      from: {
        x: 1,
        y: 1,
      },
      to: {
        x: 2,
        y: 1,
      },
      direction: 'right',
    });
  });

  it('pauses when room has zero connected players and stops after idle timeout', () => {
    const harness = setupHarness();
    const initialContext: GatewayConnectionContext = {
      connectionId: 'conn-1',
      lobbyId: 'lobby-1',
      playerId: 'player-1',
      guestId: 'guest-1',
      nickname: 'Host',
      gameRoomId: harness.roomId,
    };

    harness.connectionRegistry.setContext(initialContext);
    harness.manager.handleGameMessage('conn-1', {
      v: 1,
      type: 'game.join',
      payload: {
        roomId: harness.roomId,
        playerId: 'player-1',
      },
    });

    expect(harness.scheduler.isRunning()).toBe(true);

    harness.manager.handleConnectionClosed('conn-1', initialContext);

    expect(harness.scheduler.isRunning()).toBe(false);
    expect(harness.timers.size()).toBe(1);

    timersFireAndAssertStop(harness);

    harness.connectionRegistry.setContext({
      connectionId: 'conn-2',
      lobbyId: 'lobby-1',
      playerId: 'player-1',
      guestId: 'guest-1',
      nickname: 'Host',
    });

    expect(() =>
      harness.manager.handleGameMessage('conn-2', {
        v: 1,
        type: 'game.join',
        payload: {
          roomId: harness.roomId,
          playerId: 'player-1',
        },
      }),
    ).toThrow(LobbyServiceError);
  });

  function timersFireAndAssertStop(harness: ReturnType<typeof setupHarness>): void {
    harness.timers.fireAll();
    expect(harness.roomManager.getRoom(harness.roomId)?.status).toBe('stopped');
  }
});
