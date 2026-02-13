'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import type {
  LobbyChatMessage,
  LobbyClientMessage,
  LobbyStartAcceptedMessage,
} from '@game-platform/protocol';

import { ensureLocalProfile } from '@/src/lib/storage/local-profile';
import {
  consumeCreateLobbyAccessIntent,
  consumeJoinLobbyAccessIntent,
} from '@/src/lib/storage/lobby-access-intent-store';
import {
  getLobbySessionRecord,
  setLobbySessionRecord,
} from '@/src/lib/storage/session-token-store';
import { resolveGatewayWebSocketUrl } from '@/src/lib/env';
import {
  GatewayLobbyClient,
  type GatewayLobbyClientCloseMeta,
} from '@/src/lib/ws/gateway-lobby-client';
import { getReconnectDecision } from '@/src/lib/ws/reconnect-policy';
import {
  initialLobbySessionState,
  lobbySessionReducer,
  type LobbySessionState,
} from '@/src/lib/ws/lobby-session-reducer';

export interface UseLobbyConnectionOptions {
  routeLobbyId: string;
  nicknameHint?: string | undefined;
  createLobbyName?: string | undefined;
  onLobbyResolved?: ((lobbyId: string) => void) | undefined;
  onStartAccepted?: ((message: LobbyStartAcceptedMessage['payload']) => void) | undefined;
}

export interface UseLobbyConnectionResult {
  state: LobbySessionState;
  gatewayUrl: string;
  gatewayUrlSource: 'env' | 'fallback';
  currentPlayerId: string | null;
  currentNickname: string | null;
  sendChat: (text: string) => void;
  castVote: (gameId: string) => void;
  setReady: (isReady: boolean) => void;
  requestStart: () => void;
  requestAdminMonitor: () => void;
  setAdminTickRate: (tickRate: number) => void;
  adminKickPlayer: (targetPlayerId: string, reason?: string) => void;
  adminForceStart: () => void;
  adminPauseRoom: (roomId: string) => void;
  adminResumeRoom: (roomId: string) => void;
  adminStopRoom: (roomId: string, reason?: string) => void;
  adminForceEndRoom: (roomId: string) => void;
  leaveLobby: () => void;
  reconnectNow: () => void;
  clearError: () => void;
}

function createConnectionError(code: string, message: string, lobbyId?: string): {
  lobbyId?: string;
  code: string;
  message: string;
  details?: unknown;
} {
  if (lobbyId === undefined) {
    return {
      code,
      message,
    };
  }

  return {
    lobbyId,
    code,
    message,
  };
}

export function useLobbyConnection(options: UseLobbyConnectionOptions): UseLobbyConnectionResult {
  const resolvedGateway = useMemo(() => resolveGatewayWebSocketUrl(), []);
  const [state, dispatch] = useReducer(lobbySessionReducer, initialLobbySessionState);
  const onLobbyResolvedRef = useRef(options.onLobbyResolved);
  const onStartAcceptedRef = useRef(options.onStartAccepted);

  const stateRef = useRef(state);
  const clientRef = useRef<GatewayLobbyClient | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const knownLobbyIdRef = useRef(options.routeLobbyId === 'new' ? '' : options.routeLobbyId);
  const createLobbyPasswordRef = useRef<string | null>(null);
  const joinLobbyPasswordRef = useRef<string | null>(null);

  stateRef.current = state;

  useEffect(() => {
    onLobbyResolvedRef.current = options.onLobbyResolved;
    onStartAcceptedRef.current = options.onStartAccepted;
  }, [options.onLobbyResolved, options.onStartAccepted]);

  const clearReconnectTimer = useCallback(() => {
    if (!reconnectTimerRef.current) {
      return;
    }

    clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = null;
  }, []);

  const sendMessage = useCallback((message: LobbyClientMessage) => {
    const client = clientRef.current;
    if (!client) {
      dispatch({
        type: 'lobby.error',
        payload: createConnectionError('connection_missing', 'Lobby connection client is not initialized.'),
      });
      return;
    }

    try {
      client.send(message);
    } catch (error) {
      dispatch({
        type: 'lobby.error',
        payload: createConnectionError(
          'send_failed',
          error instanceof Error ? error.message : 'Failed to send lobby message.',
          knownLobbyIdRef.current || undefined,
        ),
      });
    }
  }, []);

  const sendJoinOrCreate = useCallback(() => {
    const profile = ensureLocalProfile(options.nicknameHint);

    if (options.routeLobbyId === 'new' && knownLobbyIdRef.current.length === 0) {
      sendMessage({
        v: 1,
        type: 'lobby.create',
        payload: {
          guestId: profile.guestId,
          nickname: profile.nickname,
          lobbyName: options.createLobbyName,
          password: createLobbyPasswordRef.current ?? undefined,
        },
      });
      return;
    }

    const lobbyId = knownLobbyIdRef.current || options.routeLobbyId;
    const sessionRecord = getLobbySessionRecord(lobbyId);
    const canUseSessionToken =
      sessionRecord !== null &&
      sessionRecord.guestId === profile.guestId;

    sendMessage({
      v: 1,
      type: 'lobby.join',
      payload: {
        lobbyId,
        guestId: profile.guestId,
        nickname: profile.nickname,
        sessionToken: canUseSessionToken ? sessionRecord.sessionToken : undefined,
        password: canUseSessionToken ? undefined : joinLobbyPasswordRef.current ?? undefined,
      },
    });
  }, [options.createLobbyName, options.nicknameHint, options.routeLobbyId, sendMessage]);

  const handleClose = useCallback(
    (meta: GatewayLobbyClientCloseMeta) => {
      const client = clientRef.current;
      if (client?.isManualClose()) {
        dispatch({
          type: 'connection.status',
          payload: {
            status: 'disconnected',
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
          type: 'lobby.error',
          payload: createConnectionError(
            'reconnect_exhausted',
            `Disconnected (code ${meta.code}). Automatic reconnect exhausted.`,
            knownLobbyIdRef.current || undefined,
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
    [],
  );

  useEffect(() => {
    dispatch({ type: 'session.reset' });
    knownLobbyIdRef.current = options.routeLobbyId === 'new' ? '' : options.routeLobbyId;
    createLobbyPasswordRef.current =
      options.routeLobbyId === 'new'
        ? consumeCreateLobbyAccessIntent()?.password ?? null
        : null;
    joinLobbyPasswordRef.current =
      options.routeLobbyId !== 'new'
        ? consumeJoinLobbyAccessIntent(options.routeLobbyId)?.password ?? null
        : null;
    reconnectAttemptRef.current = 0;
    clearReconnectTimer();

    const client = new GatewayLobbyClient(resolvedGateway.value, {
      onStatusChange: (status): void => {
        switch (status) {
          case 'connecting':
            dispatch({
              type: 'connection.status',
              payload: {
                status: reconnectAttemptRef.current > 0 ? 'reconnecting' : 'connecting',
                reconnectAttempt: reconnectAttemptRef.current,
              },
            });
            return;
          case 'connected':
            reconnectAttemptRef.current = 0;
            dispatch({
              type: 'connection.status',
              payload: {
                status: 'connected',
                reconnectAttempt: 0,
              },
            });
            sendJoinOrCreate();
            return;
          case 'error':
            dispatch({
              type: 'connection.status',
              payload: {
                status: 'error',
                reconnectAttempt: reconnectAttemptRef.current,
              },
            });
            return;
          case 'closed':
          case 'idle':
            return;
        }
      },

      onMessage: (message): void => {
        switch (message.type) {
          case 'lobby.auth.issued': {
            knownLobbyIdRef.current = message.payload.lobbyId;
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

            if (options.routeLobbyId === 'new') {
              onLobbyResolvedRef.current?.(message.payload.lobbyId);
            }

            return;
          }

          case 'lobby.state':
            knownLobbyIdRef.current = message.payload.lobbyId;
            dispatch({ type: 'lobby.state', payload: message.payload });
            return;

          case 'lobby.chat.message':
            dispatch({ type: 'lobby.chat.message', payload: message.payload });
            return;

          case 'lobby.admin.monitor.state':
            dispatch({ type: 'lobby.admin.monitor.state', payload: message.payload });
            return;

          case 'lobby.admin.action.result':
            dispatch({ type: 'lobby.admin.action.result', payload: message.payload });
            return;

          case 'lobby.error':
            dispatch({ type: 'lobby.error', payload: message.payload });
            return;

          case 'lobby.start.accepted':
            dispatch({ type: 'lobby.start.accepted', payload: message.payload });
            onStartAcceptedRef.current?.(message.payload);
            return;
        }
      },

      onClientError: (message): void => {
        dispatch({
          type: 'lobby.error',
          payload: createConnectionError('client_error', message, knownLobbyIdRef.current || undefined),
        });
      },

      onClose: handleClose,
    });

    clientRef.current = client;
    client.connect();

    return () => {
      clearReconnectTimer();
      client.disconnect('lobby_route_unmount');
      clientRef.current = null;
    };
  }, [
    clearReconnectTimer,
    handleClose,
    options.routeLobbyId,
    resolvedGateway.value,
    sendJoinOrCreate,
  ]);

  const currentPlayerId = state.auth?.playerId ?? null;
  const currentNickname = useMemo(() => {
    if (!state.lobbyState || !currentPlayerId) {
      return null;
    }

    const player = state.lobbyState.players.find((candidate) => candidate.playerId === currentPlayerId);
    return player?.nickname ?? null;
  }, [currentPlayerId, state.lobbyState]);

  const sendChat = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (trimmed.length === 0) {
        return;
      }

      const auth = stateRef.current.auth;
      const lobbyState = stateRef.current.lobbyState;
      if (!auth || !lobbyState) {
        return;
      }

      sendMessage({
        v: 1,
        type: 'lobby.chat.send',
        payload: {
          lobbyId: lobbyState.lobbyId,
          playerId: auth.playerId,
          text: trimmed,
        },
      });
    },
    [sendMessage],
  );

  const castVote = useCallback(
    (gameId: string) => {
      const auth = stateRef.current.auth;
      const lobbyState = stateRef.current.lobbyState;
      if (!auth || !lobbyState) {
        return;
      }

      sendMessage({
        v: 1,
        type: 'lobby.vote.cast',
        payload: {
          lobbyId: lobbyState.lobbyId,
          playerId: auth.playerId,
          gameId,
        },
      });
    },
    [sendMessage],
  );

  const setReady = useCallback(
    (isReady: boolean) => {
      const auth = stateRef.current.auth;
      const lobbyState = stateRef.current.lobbyState;
      if (!auth || !lobbyState) {
        return;
      }

      sendMessage({
        v: 1,
        type: 'lobby.ready.set',
        payload: {
          lobbyId: lobbyState.lobbyId,
          playerId: auth.playerId,
          isReady,
        },
      });
    },
    [sendMessage],
  );

  const requestStart = useCallback(() => {
    const auth = stateRef.current.auth;
    const lobbyState = stateRef.current.lobbyState;
    if (!auth || !lobbyState) {
      return;
    }

    sendMessage({
      v: 1,
      type: 'lobby.start.request',
      payload: {
        lobbyId: lobbyState.lobbyId,
        requestedByPlayerId: auth.playerId,
      },
    });
  }, [sendMessage]);

  const requestAdminMonitor = useCallback(() => {
    const auth = stateRef.current.auth;
    const lobbyState = stateRef.current.lobbyState;
    if (!auth || !lobbyState) {
      return;
    }

    sendMessage({
      v: 1,
      type: 'lobby.admin.monitor.request',
      payload: {
        lobbyId: lobbyState.lobbyId,
        requestedByPlayerId: auth.playerId,
      },
    });
  }, [sendMessage]);

  const setAdminTickRate = useCallback(
    (tickRate: number) => {
      const auth = stateRef.current.auth;
      const lobbyState = stateRef.current.lobbyState;
      if (!auth || !lobbyState) {
        return;
      }

      sendMessage({
        v: 1,
        type: 'lobby.admin.tick_rate.set',
        payload: {
          lobbyId: lobbyState.lobbyId,
          requestedByPlayerId: auth.playerId,
          tickRate,
        },
      });
    },
    [sendMessage],
  );

  const adminKickPlayer = useCallback(
    (targetPlayerId: string, reason?: string) => {
      const auth = stateRef.current.auth;
      const lobbyState = stateRef.current.lobbyState;
      if (!auth || !lobbyState) {
        return;
      }

      sendMessage({
        v: 1,
        type: 'lobby.admin.kick',
        payload: {
          lobbyId: lobbyState.lobbyId,
          requestedByPlayerId: auth.playerId,
          targetPlayerId,
          reason,
        },
      });
    },
    [sendMessage],
  );

  const adminForceStart = useCallback(() => {
    const auth = stateRef.current.auth;
    const lobbyState = stateRef.current.lobbyState;
    if (!auth || !lobbyState) {
      return;
    }

    sendMessage({
      v: 1,
      type: 'lobby.admin.start.force',
      payload: {
        lobbyId: lobbyState.lobbyId,
        requestedByPlayerId: auth.playerId,
      },
    });
  }, [sendMessage]);

  const adminPauseRoom = useCallback(
    (roomId: string) => {
      const auth = stateRef.current.auth;
      const lobbyState = stateRef.current.lobbyState;
      if (!auth || !lobbyState) {
        return;
      }

      sendMessage({
        v: 1,
        type: 'lobby.admin.room.pause',
        payload: {
          lobbyId: lobbyState.lobbyId,
          roomId,
          requestedByPlayerId: auth.playerId,
        },
      });
    },
    [sendMessage],
  );

  const adminResumeRoom = useCallback(
    (roomId: string) => {
      const auth = stateRef.current.auth;
      const lobbyState = stateRef.current.lobbyState;
      if (!auth || !lobbyState) {
        return;
      }

      sendMessage({
        v: 1,
        type: 'lobby.admin.room.resume',
        payload: {
          lobbyId: lobbyState.lobbyId,
          roomId,
          requestedByPlayerId: auth.playerId,
        },
      });
    },
    [sendMessage],
  );

  const adminStopRoom = useCallback(
    (roomId: string, reason?: string) => {
      const auth = stateRef.current.auth;
      const lobbyState = stateRef.current.lobbyState;
      if (!auth || !lobbyState) {
        return;
      }

      sendMessage({
        v: 1,
        type: 'lobby.admin.room.stop',
        payload: {
          lobbyId: lobbyState.lobbyId,
          roomId,
          requestedByPlayerId: auth.playerId,
          reason,
        },
      });
    },
    [sendMessage],
  );

  const adminForceEndRoom = useCallback(
    (roomId: string) => {
      const auth = stateRef.current.auth;
      const lobbyState = stateRef.current.lobbyState;
      if (!auth || !lobbyState) {
        return;
      }

      sendMessage({
        v: 1,
        type: 'lobby.admin.room.force_end',
        payload: {
          lobbyId: lobbyState.lobbyId,
          roomId,
          requestedByPlayerId: auth.playerId,
        },
      });
    },
    [sendMessage],
  );

  const leaveLobby = useCallback(() => {
    const auth = stateRef.current.auth;
    const lobbyState = stateRef.current.lobbyState;
    if (!auth || !lobbyState) {
      return;
    }

    sendMessage({
      v: 1,
      type: 'lobby.leave',
      payload: {
        lobbyId: lobbyState.lobbyId,
        guestId: auth.guestId,
        reason: 'user_leave',
      },
    });
  }, [sendMessage]);

  const reconnectNow = useCallback(() => {
    clearReconnectTimer();
    reconnectAttemptRef.current = 0;
    clientRef.current?.connect();
  }, [clearReconnectTimer]);

  const clearError = useCallback(() => {
    dispatch({ type: 'lobby.error.clear' });
  }, []);

  return {
    state,
    gatewayUrl: resolvedGateway.value,
    gatewayUrlSource: resolvedGateway.source,
    currentPlayerId,
    currentNickname,
    sendChat,
    castVote,
    setReady,
    requestStart,
    requestAdminMonitor,
    setAdminTickRate,
    adminKickPlayer,
    adminForceStart,
    adminPauseRoom,
    adminResumeRoom,
    adminStopRoom,
    adminForceEndRoom,
    leaveLobby,
    reconnectNow,
    clearError,
  };
}

export function getLatestChatMessage(
  messages: LobbyChatMessage['payload'][],
): LobbyChatMessage['payload'] | null {
  return messages.at(-1) ?? null;
}
