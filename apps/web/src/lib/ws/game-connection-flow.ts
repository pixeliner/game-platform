import { PROTOCOL_VERSION, type GameSpectateJoinMessage } from '@game-platform/protocol';

import type { ActiveGameSessionMode } from '@/src/lib/storage/active-game-session-store';

export type GameRouteMode = 'player' | 'spectator';

const TERMINAL_LOBBY_ERROR_CODES = new Set(['invalid_session_token', 'unauthorized', 'invalid_state']);

export function normalizeGameRouteMode(rawValue: string | null | undefined): GameRouteMode {
  return rawValue === 'spectator' ? 'spectator' : 'player';
}

export function resolvePlayerLobbyId(input: {
  requestedLobbyId: string | null;
  roomId: string;
  readActiveGameSession: (roomId: string) => { lobbyId: string; mode: ActiveGameSessionMode } | null;
}): string | null {
  const requested = input.requestedLobbyId?.trim();
  if (requested && requested.length > 0) {
    return requested;
  }

  const record = input.readActiveGameSession(input.roomId);
  if (!record || record.mode !== 'player') {
    return null;
  }

  return record.lobbyId;
}

export function buildSpectateJoinMessage(input: {
  roomId: string;
  guestId: string;
  nickname: string;
}): GameSpectateJoinMessage {
  return {
    v: PROTOCOL_VERSION,
    type: 'game.spectate.join',
    payload: {
      roomId: input.roomId,
      guestId: input.guestId,
      nickname: input.nickname,
    },
  };
}

export function isTerminalGameLobbyErrorCode(code: string): boolean {
  return TERMINAL_LOBBY_ERROR_CODES.has(code);
}
