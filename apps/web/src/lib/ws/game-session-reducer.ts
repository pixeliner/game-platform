import type {
  GameJoinAcceptedMessage,
  GameOverMessage,
  GameSpectateJoinedMessage,
  LobbyAuthIssuedMessage,
  LobbyErrorMessage,
} from '@game-platform/protocol';
import type { BombermanEvent, BombermanSnapshot } from '@game-platform/game-bomberman';

export type GameConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'joining_lobby'
  | 'joining_game'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'error'
  | 'game_over';

export interface GameSessionAuthState {
  lobbyId: string;
  playerId: string;
  guestId: string;
  sessionToken: string;
  expiresAtMs: number;
}

export interface GameSessionEventRecord {
  eventId: number;
  tick: number;
  event: BombermanEvent;
}

export interface GameSessionClientError {
  code: string;
  message: string;
  details?: unknown;
}

export interface GameSessionState {
  connectionStatus: GameConnectionStatus;
  reconnectAttempt: number;
  roomId: string;
  lobbyId: string;
  sessionRole: 'player' | 'spectator' | null;
  auth: GameSessionAuthState | null;
  joinAccepted: GameJoinAcceptedMessage['payload'] | null;
  spectateJoined: GameSpectateJoinedMessage['payload'] | null;
  latestSnapshot: BombermanSnapshot | null;
  latestSnapshotTick: number;
  recentEvents: GameSessionEventRecord[];
  gameOver: GameOverMessage['payload'] | null;
  lastError: LobbyErrorMessage['payload'] | GameSessionClientError | null;
}

export type GameSessionAction =
  | {
      type: 'session.reset';
      payload: {
        roomId: string;
        lobbyId: string;
      };
    }
  | {
      type: 'connection.status';
      payload: {
        status: GameConnectionStatus;
        reconnectAttempt?: number;
      };
    }
  | {
      type: 'lobby.auth.issued';
      payload: LobbyAuthIssuedMessage['payload'];
    }
  | {
      type: 'game.join.accepted';
      payload: GameJoinAcceptedMessage['payload'];
    }
  | {
      type: 'game.spectate.joined';
      payload: GameSpectateJoinedMessage['payload'];
    }
  | {
      type: 'game.snapshot';
      payload: {
        tick: number;
        snapshot: BombermanSnapshot;
      };
    }
  | {
      type: 'game.event';
      payload: GameSessionEventRecord;
    }
  | {
      type: 'game.over';
      payload: GameOverMessage['payload'];
    }
  | {
      type: 'error.set';
      payload: LobbyErrorMessage['payload'] | GameSessionClientError;
    }
  | {
      type: 'error.clear';
    };

export function createInitialGameSessionState(roomId: string, lobbyId: string): GameSessionState {
  return {
    connectionStatus: 'idle',
    reconnectAttempt: 0,
    roomId,
    lobbyId,
    sessionRole: null,
    auth: null,
    joinAccepted: null,
    spectateJoined: null,
    latestSnapshot: null,
    latestSnapshotTick: 0,
    recentEvents: [],
    gameOver: null,
    lastError: null,
  };
}

export function gameSessionReducer(
  state: GameSessionState,
  action: GameSessionAction,
): GameSessionState {
  switch (action.type) {
    case 'session.reset':
      return createInitialGameSessionState(action.payload.roomId, action.payload.lobbyId);

    case 'connection.status':
      return {
        ...state,
        connectionStatus: action.payload.status,
        reconnectAttempt: action.payload.reconnectAttempt ?? state.reconnectAttempt,
      };

    case 'lobby.auth.issued':
      return {
        ...state,
        auth: {
          lobbyId: action.payload.lobbyId,
          playerId: action.payload.playerId,
          guestId: action.payload.guestId,
          sessionToken: action.payload.sessionToken,
          expiresAtMs: action.payload.expiresAtMs,
        },
      };

    case 'game.join.accepted':
      return {
        ...state,
        sessionRole: 'player',
        joinAccepted: action.payload,
        spectateJoined: null,
        connectionStatus: state.connectionStatus === 'game_over' ? 'game_over' : 'connected',
      };

    case 'game.spectate.joined':
      return {
        ...state,
        sessionRole: 'spectator',
        joinAccepted: null,
        spectateJoined: action.payload,
        connectionStatus: state.connectionStatus === 'game_over' ? 'game_over' : 'connected',
      };

    case 'game.snapshot':
      if (action.payload.tick < state.latestSnapshotTick) {
        return state;
      }

      return {
        ...state,
        latestSnapshot: action.payload.snapshot,
        latestSnapshotTick: action.payload.tick,
        connectionStatus: state.connectionStatus === 'game_over' ? 'game_over' : 'connected',
      };

    case 'game.event': {
      const nextRecentEvents = [...state.recentEvents, action.payload]
        .sort((a, b) => {
          if (a.tick === b.tick) {
            return a.eventId - b.eventId;
          }

          return a.tick - b.tick;
        })
        .slice(-40);

      return {
        ...state,
        recentEvents: nextRecentEvents,
      };
    }

    case 'game.over':
      return {
        ...state,
        gameOver: action.payload,
        connectionStatus: 'game_over',
      };

    case 'error.set':
      return {
        ...state,
        lastError: action.payload,
      };

    case 'error.clear':
      return {
        ...state,
        lastError: null,
      };
  }
}
