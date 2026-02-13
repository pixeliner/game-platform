'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import {
  PROTOCOL_VERSION,
  type ClientMessage,
  type LobbyErrorMessage,
} from '@game-platform/protocol';
import type {
  BombermanDirection,
  BombermanPowerupKind,
  BombermanEvent,
  BombermanSnapshot,
} from '@game-platform/game-bomberman';

import { resolveGatewayWebSocketUrl } from '@/src/lib/env';
import { ensureLocalProfile } from '@/src/lib/storage/local-profile';
import {
  getActiveGameSessionRecord,
  setActiveGameSessionRecord,
} from '@/src/lib/storage/active-game-session-store';
import {
  getLobbySessionRecord,
  setLobbySessionRecord,
} from '@/src/lib/storage/session-token-store';
import { GatewayProtocolClient } from '@/src/lib/ws/gateway-protocol-client';
import {
  buildSpectateJoinMessage,
  isTerminalGameLobbyErrorCode,
  normalizeGameRouteMode,
  resolvePlayerLobbyId,
  type GameRouteMode,
} from '@/src/lib/ws/game-connection-flow';
import {
  createInitialGameSessionState,
  gameSessionReducer,
  type GameSessionClientError,
  type GameSessionState,
} from '@/src/lib/ws/game-session-reducer';
import { getReconnectDecision } from '@/src/lib/ws/reconnect-policy';

export interface UseGameConnectionOptions {
  roomId: string;
  lobbyId: string | null;
  mode?: GameRouteMode;
}

export interface UseGameConnectionResult {
  state: GameSessionState;
  gatewayUrl: string;
  gatewayUrlSource: 'env' | 'fallback';
  resolvedLobbyId: string | null;
  sessionRole: 'player' | 'spectator' | null;
  canSendInput: boolean;
  playerId: string | null;
  sendMoveIntent: (direction: BombermanDirection | null) => void;
  placeBomb: () => void;
  remoteDetonateBomb: () => void;
  throwBomb: () => void;
  reconnectNow: () => void;
  leaveGame: () => void;
  clearError: () => void;
}

const BOMBERMAN_GAME_ID = 'bomberman';
const ACTIVE_GAME_SESSION_TTL_MS = 6 * 60 * 60 * 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isDirection(value: unknown): value is BombermanDirection {
  return value === 'up' || value === 'down' || value === 'left' || value === 'right';
}

function isPowerupKind(value: unknown): value is BombermanPowerupKind {
  return (
    value === 'bomb_up' ||
    value === 'blast_up' ||
    value === 'speed_up' ||
    value === 'remote_detonator' ||
    value === 'kick_bombs' ||
    value === 'throw_bombs'
  );
}

function isTilePosition(value: unknown): value is { x: number; y: number } {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.x === 'number' && typeof value.y === 'number';
}

function isBombermanSnapshot(value: unknown): value is BombermanSnapshot {
  if (!isRecord(value)) {
    return false;
  }

  if (value.phase !== 'running' && value.phase !== 'finished') {
    return false;
  }

  if (typeof value.tick !== 'number' || typeof value.width !== 'number' || typeof value.height !== 'number') {
    return false;
  }

  if (!Array.isArray(value.hardWalls) || !value.hardWalls.every(isTilePosition)) {
    return false;
  }

  if (
    !Array.isArray(value.softBlocks) ||
    !value.softBlocks.every((softBlock) => {
      if (!isRecord(softBlock)) {
        return false;
      }

      return (
        typeof softBlock.x === 'number' &&
        typeof softBlock.y === 'number' &&
        (softBlock.kind === 'brick' || softBlock.kind === 'crate' || softBlock.kind === 'barrel')
      );
    })
  ) {
    return false;
  }

  if (
    !Array.isArray(value.powerups) ||
    !value.powerups.every((powerup) => {
      return (
        isRecord(powerup) &&
        typeof powerup.x === 'number' &&
        typeof powerup.y === 'number' &&
        isPowerupKind(powerup.kind)
      );
    })
  ) {
    return false;
  }

  if (
    !Array.isArray(value.players) ||
    !value.players.every((player) => {
      if (!isRecord(player)) {
        return false;
      }

      return (
        typeof player.playerId === 'string' &&
        typeof player.x === 'number' &&
        typeof player.y === 'number' &&
        typeof player.alive === 'boolean' &&
        typeof player.activeBombCount === 'number' &&
        typeof player.bombLimit === 'number' &&
        typeof player.blastRadius === 'number' &&
        typeof player.speedTier === 'number' &&
        typeof player.hasRemoteDetonator === 'boolean' &&
        typeof player.canKickBombs === 'boolean' &&
        typeof player.canThrowBombs === 'boolean' &&
        (player.direction === null || isDirection(player.direction))
      );
    })
  ) {
    return false;
  }

  if (
    !Array.isArray(value.bombs) ||
    !value.bombs.every((bomb) => {
      if (!isRecord(bomb)) {
        return false;
      }

      return (
        typeof bomb.ownerPlayerId === 'string' &&
        typeof bomb.x === 'number' &&
        typeof bomb.y === 'number' &&
        typeof bomb.fuseTicksRemaining === 'number' &&
        typeof bomb.radius === 'number' &&
        (bomb.movingDirection === null || isDirection(bomb.movingDirection))
      );
    })
  ) {
    return false;
  }

  if (
    !Array.isArray(value.flames) ||
    !value.flames.every((flame) => {
      if (!isRecord(flame)) {
        return false;
      }

      return (
        typeof flame.x === 'number' &&
        typeof flame.y === 'number' &&
        typeof flame.ticksRemaining === 'number' &&
        (flame.sourceOwnerPlayerId === null || typeof flame.sourceOwnerPlayerId === 'string')
      );
    })
  ) {
    return false;
  }

  if (value.winnerPlayerId !== null && typeof value.winnerPlayerId !== 'string') {
    return false;
  }

  return true;
}

function isBombermanEvent(value: unknown): value is BombermanEvent {
  if (!isRecord(value) || typeof value.kind !== 'string') {
    return false;
  }

  switch (value.kind) {
    case 'player.moved':
      return (
        typeof value.playerId === 'string' &&
        isTilePosition(value.from) &&
        isTilePosition(value.to) &&
        isDirection(value.direction)
      );
    case 'bomb.placed':
      return (
        typeof value.playerId === 'string' &&
        typeof value.x === 'number' &&
        typeof value.y === 'number' &&
        typeof value.fuseTicksRemaining === 'number' &&
        typeof value.radius === 'number'
      );
    case 'bomb.exploded':
      return (
        typeof value.ownerPlayerId === 'string' &&
        typeof value.x === 'number' &&
        typeof value.y === 'number' &&
        Array.isArray(value.affectedTiles) &&
        value.affectedTiles.every(isTilePosition)
      );
    case 'bomb.kicked':
    case 'bomb.thrown':
      return (
        typeof value.byPlayerId === 'string' &&
        typeof value.ownerPlayerId === 'string' &&
        isTilePosition(value.from) &&
        isTilePosition(value.to) &&
        isDirection(value.direction)
      );
    case 'bomb.remote_detonated':
      return (
        typeof value.playerId === 'string' &&
        typeof value.x === 'number' &&
        typeof value.y === 'number'
      );
    case 'block.destroyed':
      return (
        typeof value.x === 'number' &&
        typeof value.y === 'number' &&
        (value.blockKind === 'brick' || value.blockKind === 'crate' || value.blockKind === 'barrel') &&
        (value.droppedPowerupKind === null || isPowerupKind(value.droppedPowerupKind))
      );
    case 'powerup.spawned':
      return (
        typeof value.x === 'number' &&
        typeof value.y === 'number' &&
        isPowerupKind(value.powerupKind)
      );
    case 'powerup.collected':
      return (
        typeof value.playerId === 'string' &&
        typeof value.x === 'number' &&
        typeof value.y === 'number' &&
        isPowerupKind(value.powerupKind)
      );
    case 'player.eliminated':
      return (
        typeof value.playerId === 'string' &&
        (value.byPlayerId === null || typeof value.byPlayerId === 'string') &&
        typeof value.x === 'number' &&
        typeof value.y === 'number'
      );
    case 'round.over':
      return (
        (value.winnerPlayerId === null || typeof value.winnerPlayerId === 'string') &&
        (value.reason === 'last_player_standing' || value.reason === 'tick_limit')
      );
    default:
      return false;
  }
}

function createClientError(code: string, message: string, details?: unknown): GameSessionClientError {
  return {
    code,
    message,
    ...(details !== undefined ? { details } : {}),
  };
}

export function useGameConnection(options: UseGameConnectionOptions): UseGameConnectionResult {
  const resolvedGateway = useMemo(() => resolveGatewayWebSocketUrl(), []);
  const requestedMode = normalizeGameRouteMode(options.mode);
  const resolvedPlayerLobbyId = useMemo(
    () =>
      requestedMode === 'player'
        ? resolvePlayerLobbyId({
            requestedLobbyId: options.lobbyId,
            roomId: options.roomId,
            readActiveGameSession: (roomId) => getActiveGameSessionRecord(roomId),
          })
        : null,
    [options.lobbyId, options.roomId, requestedMode],
  );
  const resolvedLobbyId = requestedMode === 'player' ? resolvedPlayerLobbyId : options.lobbyId;

  const [state, dispatch] = useReducer(
    gameSessionReducer,
    createInitialGameSessionState(options.roomId, resolvedLobbyId ?? ''),
  );

  const stateRef = useRef(state);
  const clientRef = useRef<GatewayProtocolClient | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const terminalErrorRef = useRef(false);
  const lastObservedServerTickRef = useRef(0);
  const lastSentInputTickRef = useRef(0);

  stateRef.current = state;

  const clearReconnectTimer = useCallback(() => {
    if (!reconnectTimerRef.current) {
      return;
    }

    clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = null;
  }, []);

  const sendMessage = useCallback((message: ClientMessage) => {
    const client = clientRef.current;
    if (!client) {
      dispatch({
        type: 'error.set',
        payload: createClientError('connection_missing', 'Connection client is not initialized.'),
      });
      return;
    }

    try {
      client.send(message);
    } catch (error) {
      dispatch({
        type: 'error.set',
        payload: createClientError(
          'send_failed',
          error instanceof Error ? error.message : 'Failed to send message to gateway.',
        ),
      });
    }
  }, []);

  const sendLobbyJoin = useCallback(() => {
    if (requestedMode !== 'player') {
      return;
    }

    if (!resolvedPlayerLobbyId) {
      terminalErrorRef.current = true;
      dispatch({
        type: 'connection.status',
        payload: {
          status: 'error',
          reconnectAttempt: reconnectAttemptRef.current,
        },
      });
      dispatch({
        type: 'error.set',
        payload: createClientError(
          'missing_lobby_id',
          'No lobbyId was supplied and no active game context was found for this room.',
        ),
      });
      return;
    }

    const session = getLobbySessionRecord(resolvedPlayerLobbyId);
    if (!session) {
      terminalErrorRef.current = true;
      dispatch({
        type: 'connection.status',
        payload: {
          status: 'error',
          reconnectAttempt: reconnectAttemptRef.current,
        },
      });
      dispatch({
        type: 'error.set',
        payload: createClientError(
          'missing_session',
          'No valid lobby session token was found. Return to lobby and rejoin.',
        ),
      });
      return;
    }

    const profile = ensureLocalProfile();
    const nickname = profile.nickname;

    dispatch({
      type: 'connection.status',
      payload: {
        status: 'joining_lobby',
        reconnectAttempt: reconnectAttemptRef.current,
      },
    });

    sendMessage({
      v: PROTOCOL_VERSION,
      type: 'lobby.join',
      payload: {
        lobbyId: resolvedPlayerLobbyId,
        guestId: session.guestId,
        nickname,
        sessionToken: session.sessionToken,
      },
    });
  }, [requestedMode, resolvedPlayerLobbyId, sendMessage]);

  useEffect(() => {
    dispatch({
      type: 'session.reset',
      payload: {
        roomId: options.roomId,
        lobbyId: resolvedLobbyId ?? '',
      },
    });

    clearReconnectTimer();
    reconnectAttemptRef.current = 0;
    terminalErrorRef.current = false;
    lastObservedServerTickRef.current = 0;
    lastSentInputTickRef.current = 0;

    if (requestedMode === 'player') {
      if (!resolvedPlayerLobbyId) {
        terminalErrorRef.current = true;
        dispatch({
          type: 'connection.status',
          payload: {
            status: 'error',
            reconnectAttempt: reconnectAttemptRef.current,
          },
        });
        dispatch({
          type: 'error.set',
          payload: createClientError(
            'missing_lobby_id',
            'No lobbyId was supplied and no active game context was found for this room.',
          ),
        });
        return;
      }

      if (!getLobbySessionRecord(resolvedPlayerLobbyId)) {
        terminalErrorRef.current = true;
        dispatch({
          type: 'connection.status',
          payload: {
            status: 'error',
            reconnectAttempt: reconnectAttemptRef.current,
          },
        });
        dispatch({
          type: 'error.set',
          payload: createClientError(
            'missing_session',
            'No valid lobby session token was found. Return to lobby and rejoin.',
          ),
        });
        return;
      }
    }

    const client = new GatewayProtocolClient(resolvedGateway.value, {
      onStatusChange: (status): void => {
        if (status === 'connecting') {
          dispatch({
            type: 'connection.status',
            payload: {
              status: reconnectAttemptRef.current > 0 ? 'reconnecting' : 'connecting',
              reconnectAttempt: reconnectAttemptRef.current,
            },
          });
          return;
        }

        if (status === 'connected') {
          reconnectAttemptRef.current = 0;
          if (requestedMode === 'spectator') {
            const profile = ensureLocalProfile();
            dispatch({
              type: 'connection.status',
              payload: {
                status: 'joining_game',
                reconnectAttempt: reconnectAttemptRef.current,
              },
            });
            sendMessage(buildSpectateJoinMessage({
              roomId: options.roomId,
              guestId: profile.guestId,
              nickname: profile.nickname,
            }));
            return;
          }

          sendLobbyJoin();
          return;
        }

        if (status === 'error') {
          dispatch({
            type: 'connection.status',
            payload: {
              status: 'error',
              reconnectAttempt: reconnectAttemptRef.current,
            },
          });
        }
      },

      onMessage: (message): void => {
        switch (message.type) {
          case 'lobby.auth.issued': {
            if (requestedMode !== 'player') {
              return;
            }

            if (message.payload.lobbyId !== resolvedPlayerLobbyId) {
              dispatch({
                type: 'error.set',
                payload: createClientError(
                  'invalid_state',
                  `Received auth for unexpected lobby ${message.payload.lobbyId}.`,
                ),
              });
              return;
            }

            setLobbySessionRecord({
              lobbyId: message.payload.lobbyId,
              sessionToken: message.payload.sessionToken,
              playerId: message.payload.playerId,
              guestId: message.payload.guestId,
              expiresAtMs: message.payload.expiresAtMs,
            });

            dispatch({
              type: 'lobby.auth.issued',
              payload: message.payload,
            });

            dispatch({
              type: 'connection.status',
              payload: {
                status: 'joining_game',
                reconnectAttempt: reconnectAttemptRef.current,
              },
            });

            sendMessage({
              v: PROTOCOL_VERSION,
              type: 'game.join',
              payload: {
                roomId: options.roomId,
                playerId: message.payload.playerId,
              },
            });
            return;
          }

          case 'game.join.accepted': {
            if (
              message.payload.roomId !== options.roomId ||
              message.payload.gameId !== BOMBERMAN_GAME_ID
            ) {
              return;
            }

            lastObservedServerTickRef.current = Math.max(
              lastObservedServerTickRef.current,
              message.payload.tick,
            );
            lastSentInputTickRef.current = Math.max(
              lastSentInputTickRef.current,
              message.payload.tick,
            );

            if (resolvedPlayerLobbyId) {
              setActiveGameSessionRecord({
                roomId: options.roomId,
                lobbyId: resolvedPlayerLobbyId,
                mode: 'player',
                expiresAtMs: Date.now() + ACTIVE_GAME_SESSION_TTL_MS,
              });
            }

            dispatch({
              type: 'game.join.accepted',
              payload: message.payload,
            });
            return;
          }

          case 'game.spectate.joined': {
            if (
              message.payload.roomId !== options.roomId ||
              message.payload.gameId !== BOMBERMAN_GAME_ID
            ) {
              return;
            }

            lastObservedServerTickRef.current = Math.max(
              lastObservedServerTickRef.current,
              message.payload.tick,
            );
            lastSentInputTickRef.current = Math.max(
              lastSentInputTickRef.current,
              message.payload.tick,
            );

            setActiveGameSessionRecord({
              roomId: options.roomId,
              lobbyId: resolvedLobbyId ?? '',
              mode: 'spectator',
              expiresAtMs: Date.now() + ACTIVE_GAME_SESSION_TTL_MS,
            });

            dispatch({
              type: 'game.spectate.joined',
              payload: message.payload,
            });
            return;
          }

          case 'game.snapshot': {
            if (
              message.payload.roomId !== options.roomId ||
              message.payload.gameId !== BOMBERMAN_GAME_ID
            ) {
              return;
            }

            if (!isBombermanSnapshot(message.payload.snapshot)) {
              dispatch({
                type: 'error.set',
                payload: createClientError('invalid_message', 'Received invalid bomberman snapshot payload.'),
              });
              return;
            }

            if (message.payload.tick < lastObservedServerTickRef.current) {
              return;
            }

            lastObservedServerTickRef.current = message.payload.tick;
            dispatch({
              type: 'game.snapshot',
              payload: {
                tick: message.payload.tick,
                snapshot: message.payload.snapshot,
              },
            });
            return;
          }

          case 'game.event': {
            if (
              message.payload.roomId !== options.roomId ||
              message.payload.gameId !== BOMBERMAN_GAME_ID
            ) {
              return;
            }

            if (!isBombermanEvent(message.payload.event)) {
              return;
            }

            dispatch({
              type: 'game.event',
              payload: {
                eventId: message.payload.eventId,
                tick: message.payload.tick,
                event: message.payload.event,
              },
            });
            return;
          }

          case 'game.over': {
            if (
              message.payload.roomId !== options.roomId ||
              message.payload.gameId !== BOMBERMAN_GAME_ID
            ) {
              return;
            }

            dispatch({
              type: 'game.over',
              payload: message.payload,
            });
            return;
          }

          case 'lobby.error': {
            dispatch({
              type: 'error.set',
              payload: message.payload,
            });

            if (isTerminalGameLobbyErrorCode(message.payload.code)) {
              terminalErrorRef.current = true;
              dispatch({
                type: 'connection.status',
                payload: {
                  status: 'error',
                  reconnectAttempt: reconnectAttemptRef.current,
                },
              });
            }
            return;
          }

          default:
            return;
        }
      },

      onClientError: (message): void => {
        dispatch({
          type: 'error.set',
          payload: createClientError('client_error', message),
        });
      },

      onClose: (): void => {
        if (client.isManualClose()) {
          dispatch({
            type: 'connection.status',
            payload: {
              status: 'disconnected',
              reconnectAttempt: reconnectAttemptRef.current,
            },
          });
          return;
        }

        if (terminalErrorRef.current) {
          dispatch({
            type: 'connection.status',
            payload: {
              status: 'error',
              reconnectAttempt: reconnectAttemptRef.current,
            },
          });
          return;
        }

        const decision = getReconnectDecision(reconnectAttemptRef.current);
        if (!decision.shouldRetry || decision.delayMs === null) {
          dispatch({
            type: 'connection.status',
            payload: {
              status: 'disconnected',
              reconnectAttempt: reconnectAttemptRef.current,
            },
          });
          dispatch({
            type: 'error.set',
            payload: createClientError(
              'reconnect_exhausted',
              'Disconnected from gateway and automatic reconnect attempts were exhausted.',
            ),
          });
          return;
        }

        const nextAttempt = reconnectAttemptRef.current + 1;
        dispatch({
          type: 'connection.status',
          payload: {
            status: 'reconnecting',
            reconnectAttempt: nextAttempt,
          },
        });

        reconnectTimerRef.current = setTimeout(() => {
          reconnectTimerRef.current = null;
          reconnectAttemptRef.current = nextAttempt;
          clientRef.current?.connect();
        }, decision.delayMs);
      },
    });

    clientRef.current = client;
    client.connect();

    return () => {
      clearReconnectTimer();
      client.disconnect('game_route_unmount');
      clientRef.current = null;
    };
  }, [
    clearReconnectTimer,
    options.roomId,
    requestedMode,
    resolvedGateway.value,
    resolvedLobbyId,
    resolvedPlayerLobbyId,
    sendLobbyJoin,
    sendMessage,
  ]);

  const sendInput = useCallback((input: unknown) => {
    const auth = stateRef.current.auth;
    const joinAccepted = stateRef.current.joinAccepted;

    if (!auth || !joinAccepted || stateRef.current.connectionStatus !== 'connected') {
      return;
    }

    const nextTick = Math.max(lastObservedServerTickRef.current + 1, lastSentInputTickRef.current + 1);
    lastSentInputTickRef.current = nextTick;

    sendMessage({
      v: PROTOCOL_VERSION,
      type: 'game.input',
      payload: {
        roomId: options.roomId,
        playerId: auth.playerId,
        tick: nextTick,
        input,
      },
    });
  }, [options.roomId, sendMessage]);

  const sendMoveIntent = useCallback((direction: BombermanDirection | null) => {
    sendInput({
      kind: 'move.intent',
      direction,
    });
  }, [sendInput]);

  const placeBomb = useCallback(() => {
    sendInput({
      kind: 'bomb.place',
    });
  }, [sendInput]);

  const remoteDetonateBomb = useCallback(() => {
    sendInput({
      kind: 'bomb.remote_detonate',
    });
  }, [sendInput]);

  const throwBomb = useCallback(() => {
    sendInput({
      kind: 'bomb.throw',
    });
  }, [sendInput]);

  const leaveGame = useCallback(() => {
    const auth = stateRef.current.auth;
    const joinAccepted = stateRef.current.joinAccepted;
    if (auth && joinAccepted) {
      sendMessage({
        v: PROTOCOL_VERSION,
        type: 'game.leave',
        payload: {
          roomId: options.roomId,
          playerId: auth.playerId,
          reason: 'user_leave',
        },
      });
    }

    clearReconnectTimer();
    clientRef.current?.disconnect('game_leave');
    dispatch({
      type: 'connection.status',
      payload: {
        status: 'disconnected',
        reconnectAttempt: reconnectAttemptRef.current,
      },
    });
  }, [clearReconnectTimer, options.roomId, sendMessage]);

  const reconnectNow = useCallback(() => {
    terminalErrorRef.current = false;
    clearReconnectTimer();
    reconnectAttemptRef.current = 0;
    clientRef.current?.connect();
  }, [clearReconnectTimer]);

  const clearError = useCallback(() => {
    dispatch({
      type: 'error.clear',
    });
  }, []);

  return {
    state,
    gatewayUrl: resolvedGateway.value,
    gatewayUrlSource: resolvedGateway.source,
    resolvedLobbyId,
    sessionRole: state.sessionRole,
    canSendInput:
      state.connectionStatus === 'connected' &&
      state.sessionRole === 'player' &&
      state.auth !== null &&
      state.joinAccepted !== null,
    playerId: state.auth?.playerId ?? null,
    sendMoveIntent,
    placeBomb,
    remoteDetonateBomb,
    throwBomb,
    reconnectNow,
    leaveGame,
    clearError,
  };
}

export function describeLobbyError(error: LobbyErrorMessage['payload'] | GameSessionClientError): string {
  if ('lobbyId' in error && typeof error.lobbyId === 'string') {
    return `[${error.code}] ${error.message} (lobby: ${error.lobbyId})`;
  }

  return `[${error.code}] ${error.message}`;
}
