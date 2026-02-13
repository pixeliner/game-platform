export const LOBBY_ERROR_CODES = [
  'invalid_message',
  'unsupported_message',
  'lobby_not_found',
  'already_in_lobby',
  'duplicate_connection',
  'invalid_session_token',
  'unauthorized',
  'not_enough_players',
  'not_ready',
  'game_not_selected',
  'invalid_state',
] as const;

export type LobbyErrorCode = (typeof LOBBY_ERROR_CODES)[number];

export class LobbyServiceError extends Error {
  public readonly code: LobbyErrorCode;
  public readonly lobbyId: string | undefined;
  public readonly details: unknown;

  public constructor(code: LobbyErrorCode, message: string, options?: { lobbyId?: string; details?: unknown }) {
    super(message);
    this.name = 'LobbyServiceError';
    this.code = code;
    this.lobbyId = options?.lobbyId;
    this.details = options?.details;
  }
}
