import type {
  LobbyAuthIssuedMessage,
  LobbyChatMessage,
  LobbyErrorMessage,
  LobbyStartAcceptedMessage,
  LobbyStateMessage,
} from '@game-platform/protocol';

export type LobbyConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'error';

export interface LobbyAuthState {
  lobbyId: string;
  playerId: string;
  guestId: string;
  sessionToken: string;
  expiresAtMs: number;
}

export interface LobbySessionState {
  connectionStatus: LobbyConnectionStatus;
  reconnectAttempt: number;
  auth: LobbyAuthState | null;
  lobbyState: LobbyStateMessage['payload'] | null;
  chatMessages: LobbyChatMessage['payload'][];
  lastError: LobbyErrorMessage['payload'] | null;
  startAccepted: LobbyStartAcceptedMessage['payload'] | null;
}

export type LobbySessionAction =
  | {
      type: 'connection.status';
      payload: {
        status: LobbyConnectionStatus;
        reconnectAttempt?: number;
      };
    }
  | {
      type: 'lobby.auth.issued';
      payload: LobbyAuthIssuedMessage['payload'];
    }
  | {
      type: 'lobby.state';
      payload: LobbyStateMessage['payload'];
    }
  | {
      type: 'lobby.chat.message';
      payload: LobbyChatMessage['payload'];
    }
  | {
      type: 'lobby.error';
      payload: LobbyErrorMessage['payload'];
    }
  | {
      type: 'lobby.start.accepted';
      payload: LobbyStartAcceptedMessage['payload'];
    }
  | {
      type: 'lobby.error.clear';
    }
  | {
      type: 'session.reset';
    };

export const initialLobbySessionState: LobbySessionState = {
  connectionStatus: 'idle',
  reconnectAttempt: 0,
  auth: null,
  lobbyState: null,
  chatMessages: [],
  lastError: null,
  startAccepted: null,
};

export function lobbySessionReducer(
  state: LobbySessionState,
  action: LobbySessionAction,
): LobbySessionState {
  switch (action.type) {
    case 'connection.status': {
      return {
        ...state,
        connectionStatus: action.payload.status,
        reconnectAttempt: action.payload.reconnectAttempt ?? state.reconnectAttempt,
      };
    }

    case 'lobby.auth.issued': {
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
    }

    case 'lobby.state': {
      return {
        ...state,
        lobbyState: action.payload,
      };
    }

    case 'lobby.chat.message': {
      const chatMessages = [...state.chatMessages, action.payload].sort((a, b) => {
        if (a.sentAtMs === b.sentAtMs) {
          return a.messageId.localeCompare(b.messageId);
        }

        return a.sentAtMs - b.sentAtMs;
      });

      return {
        ...state,
        chatMessages,
      };
    }

    case 'lobby.error': {
      return {
        ...state,
        lastError: action.payload,
      };
    }

    case 'lobby.start.accepted': {
      return {
        ...state,
        startAccepted: action.payload,
      };
    }

    case 'lobby.error.clear': {
      return {
        ...state,
        lastError: null,
      };
    }

    case 'session.reset': {
      return initialLobbySessionState;
    }
  }
}
