export type LobbyPhase = 'waiting' | 'starting' | 'in_game' | 'closed';

export interface LobbyPasswordHash {
  algorithm: 'scrypt_v1';
  salt: string;
  digest: string;
}

export interface LobbyPlayerState {
  playerId: string;
  guestId: string;
  nickname: string;
  isHost: boolean;
  isReady: boolean;
  voteGameId: string | null;
  isConnected: boolean;
  joinedAtMs: number;
  lastSeenAtMs: number;
}

export interface LobbyState {
  lobbyId: string;
  lobbyName: string;
  hostPlayerId: string;
  phase: LobbyPhase;
  activeRoomId: string | null;
  activeRoomRuntimeState: 'running' | 'paused' | null;
  selectedGameId: string | null;
  configuredTickRate: number;
  maxPlayers: number;
  passwordHash: LobbyPasswordHash | null;
  createdAtMs: number;
  updatedAtMs: number;
  playersById: Map<string, LobbyPlayerState>;
  votesByPlayerId: Map<string, string>;
}

export interface CreateLobbyInput {
  lobbyId: string;
  playerId: string;
  guestId: string;
  nickname: string;
  lobbyName: string;
  maxPlayers: number;
  configuredTickRate: number;
  passwordHash: LobbyPasswordHash | null;
  nowMs: number;
}

export interface JoinLobbyInput {
  lobbyId: string;
  playerId: string;
  guestId: string;
  nickname: string;
  nowMs: number;
}

export interface ReconnectLobbyInput {
  lobbyId: string;
  playerId: string;
  guestId: string;
  nickname: string;
  nowMs: number;
}

export interface SetReadyInput {
  lobbyId: string;
  playerId: string;
  isReady: boolean;
  nowMs: number;
}

export interface VoteCastInput {
  lobbyId: string;
  playerId: string;
  gameId: string;
  nowMs: number;
}

export interface StartRequestInput {
  lobbyId: string;
  requestedByPlayerId: string;
  bypassReadiness?: boolean;
  nowMs: number;
}

export interface StartRequestResult {
  lobby: LobbyState;
  gameId: string;
}

export interface LobbyView {
  lobbyId: string;
  lobbyName: string;
  hostPlayerId: string;
  phase: LobbyPhase;
  activeRoomId: string | null;
  activeRoomRuntimeState: 'running' | 'paused' | null;
  selectedGameId: string | null;
  configuredTickRate: number;
  requiresPassword: boolean;
  maxPlayers: number;
  players: Array<{
    playerId: string;
    guestId: string;
    nickname: string;
    isHost: boolean;
    isReady: boolean;
    voteGameId: string | null;
    isConnected: boolean;
  }>;
  votesByPlayerId: Record<string, string>;
}

export interface LobbyDiscoveryView {
  lobbyId: string;
  lobbyName: string;
  phase: LobbyPhase;
  activeRoomId: string | null;
  selectedGameId: string | null;
  requiresPassword: boolean;
  maxPlayers: number;
  playerCount: number;
  connectedCount: number;
  isJoinable: boolean;
  createdAtMs: number;
  updatedAtMs: number;
}
