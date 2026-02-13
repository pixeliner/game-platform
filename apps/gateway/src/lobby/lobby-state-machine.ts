import { LobbyServiceError } from '../errors.js';
import { computeSelectedGameId } from './lobby-selection.js';
import type {
  CreateLobbyInput,
  JoinLobbyInput,
  LobbyDiscoveryView,
  LobbyPlayerState,
  LobbyState,
  LobbyView,
  ReconnectLobbyInput,
  SetReadyInput,
  StartRequestInput,
  StartRequestResult,
  VoteCastInput,
} from './lobby-types.js';

export class LobbyStateMachine {
  private readonly lobbies = new Map<string, LobbyState>();

  public createLobby(input: CreateLobbyInput): LobbyState {
    if (this.lobbies.has(input.lobbyId)) {
      throw new LobbyServiceError('invalid_state', 'Lobby already exists.', { lobbyId: input.lobbyId });
    }

    const host: LobbyPlayerState = {
      playerId: input.playerId,
      guestId: input.guestId,
      nickname: input.nickname,
      isHost: true,
      isReady: false,
      voteGameId: null,
      isConnected: true,
      joinedAtMs: input.nowMs,
      lastSeenAtMs: input.nowMs,
    };

    const lobby: LobbyState = {
      lobbyId: input.lobbyId,
      lobbyName: input.lobbyName,
      hostPlayerId: host.playerId,
      phase: 'waiting',
      activeRoomId: null,
      selectedGameId: null,
      maxPlayers: input.maxPlayers,
      passwordHash: input.passwordHash,
      createdAtMs: input.nowMs,
      updatedAtMs: input.nowMs,
      playersById: new Map([[host.playerId, host]]),
      votesByPlayerId: new Map(),
    };

    this.lobbies.set(lobby.lobbyId, lobby);
    return lobby;
  }

  public joinLobby(input: JoinLobbyInput): LobbyState {
    const lobby = this.requireLobby(input.lobbyId);
    if (lobby.phase !== 'waiting') {
      throw new LobbyServiceError('invalid_state', 'Lobby is not accepting new players.', {
        lobbyId: input.lobbyId,
      });
    }

    if (lobby.playersById.size >= lobby.maxPlayers) {
      throw new LobbyServiceError('lobby_full', 'Lobby has reached max player capacity.', {
        lobbyId: input.lobbyId,
      });
    }

    for (const player of lobby.playersById.values()) {
      if (player.guestId === input.guestId && player.isConnected) {
        throw new LobbyServiceError('duplicate_connection', 'Guest is already connected to this lobby.', {
          lobbyId: input.lobbyId,
        });
      }
    }

    const player: LobbyPlayerState = {
      playerId: input.playerId,
      guestId: input.guestId,
      nickname: input.nickname,
      isHost: false,
      isReady: false,
      voteGameId: null,
      isConnected: true,
      joinedAtMs: input.nowMs,
      lastSeenAtMs: input.nowMs,
    };

    lobby.playersById.set(player.playerId, player);
    lobby.selectedGameId = computeSelectedGameId(lobby);
    lobby.updatedAtMs = input.nowMs;
    return lobby;
  }

  public reconnectPlayer(input: ReconnectLobbyInput): LobbyState {
    const lobby = this.requireLobby(input.lobbyId);
    const player = lobby.playersById.get(input.playerId);

    if (!player) {
      throw new LobbyServiceError('invalid_session_token', 'Reconnect player was not found in lobby.', {
        lobbyId: input.lobbyId,
      });
    }

    if (player.guestId !== input.guestId) {
      throw new LobbyServiceError('invalid_session_token', 'Reconnect token does not match guest identity.', {
        lobbyId: input.lobbyId,
      });
    }

    if (player.isConnected) {
      throw new LobbyServiceError('duplicate_connection', 'Player is already connected.', {
        lobbyId: input.lobbyId,
      });
    }

    player.isConnected = true;
    player.nickname = input.nickname;
    player.lastSeenAtMs = input.nowMs;
    lobby.updatedAtMs = input.nowMs;

    return lobby;
  }

  public removePlayer(lobbyId: string, playerId: string, nowMs: number): LobbyState | null {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) {
      return null;
    }

    const removedPlayer = lobby.playersById.get(playerId);
    if (!removedPlayer) {
      return lobby;
    }

    lobby.playersById.delete(playerId);
    lobby.votesByPlayerId.delete(playerId);

    if (lobby.playersById.size === 0) {
      this.lobbies.delete(lobbyId);
      return null;
    }

    if (lobby.hostPlayerId === playerId) {
      this.assignNewHost(lobby);
    }

    lobby.selectedGameId = computeSelectedGameId(lobby);
    lobby.updatedAtMs = nowMs;

    return lobby;
  }

  public markDisconnected(lobbyId: string, playerId: string, nowMs: number): LobbyState | null {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) {
      return null;
    }

    const player = lobby.playersById.get(playerId);
    if (!player) {
      return lobby;
    }

    player.isConnected = false;
    player.lastSeenAtMs = nowMs;
    lobby.updatedAtMs = nowMs;

    return lobby;
  }

  public setReady(input: SetReadyInput): LobbyState {
    const lobby = this.requireLobby(input.lobbyId);
    if (lobby.phase !== 'waiting') {
      throw new LobbyServiceError('invalid_state', 'Readiness can only be changed while waiting.', {
        lobbyId: input.lobbyId,
      });
    }

    const player = this.requirePlayer(lobby, input.playerId);
    player.isReady = input.isReady;
    player.lastSeenAtMs = input.nowMs;
    lobby.updatedAtMs = input.nowMs;

    return lobby;
  }

  public castVote(input: VoteCastInput): LobbyState {
    const lobby = this.requireLobby(input.lobbyId);
    if (lobby.phase !== 'waiting') {
      throw new LobbyServiceError('invalid_state', 'Voting can only occur while waiting.', {
        lobbyId: input.lobbyId,
      });
    }

    const player = this.requirePlayer(lobby, input.playerId);
    player.voteGameId = input.gameId;
    player.lastSeenAtMs = input.nowMs;
    lobby.votesByPlayerId.set(input.playerId, input.gameId);
    lobby.selectedGameId = computeSelectedGameId(lobby);
    lobby.updatedAtMs = input.nowMs;

    return lobby;
  }

  public requestStart(input: StartRequestInput): StartRequestResult {
    const lobby = this.requireLobby(input.lobbyId);
    if (lobby.phase !== 'waiting') {
      throw new LobbyServiceError('invalid_state', 'Lobby cannot be started from this phase.', {
        lobbyId: input.lobbyId,
      });
    }

    const requester = this.requirePlayer(lobby, input.requestedByPlayerId);
    requester.lastSeenAtMs = input.nowMs;

    if (!requester.isHost) {
      throw new LobbyServiceError('unauthorized', 'Only host can start the lobby.', {
        lobbyId: input.lobbyId,
      });
    }

    if (!lobby.selectedGameId) {
      throw new LobbyServiceError('game_not_selected', 'No game selected for this lobby.', {
        lobbyId: input.lobbyId,
      });
    }

    const connectedPlayers = [...lobby.playersById.values()].filter((player) => player.isConnected);
    if (connectedPlayers.length < 2) {
      throw new LobbyServiceError('not_enough_players', 'At least two connected players are required.', {
        lobbyId: input.lobbyId,
      });
    }

    const notReadyPlayerIds = connectedPlayers
      .filter((player) => !player.isReady)
      .map((player) => player.playerId);

    if (notReadyPlayerIds.length > 0) {
      throw new LobbyServiceError('not_ready', 'All connected players must be ready.', {
        lobbyId: input.lobbyId,
        details: { notReadyPlayerIds },
      });
    }

    lobby.phase = 'starting';
    lobby.updatedAtMs = input.nowMs;

    return {
      lobby,
      gameId: lobby.selectedGameId,
    };
  }

  public setInGame(lobbyId: string, roomId: string, nowMs: number): LobbyState {
    const lobby = this.requireLobby(lobbyId);
    lobby.phase = 'in_game';
    lobby.activeRoomId = roomId;
    lobby.updatedAtMs = nowMs;
    return lobby;
  }

  public setWaitingAfterGame(lobbyId: string, nowMs: number): LobbyState {
    const lobby = this.requireLobby(lobbyId);
    lobby.phase = 'waiting';
    lobby.activeRoomId = null;
    lobby.updatedAtMs = nowMs;

    for (const player of lobby.playersById.values()) {
      if (player.isConnected) {
        player.isReady = false;
      }
    }

    return lobby;
  }

  public getLobby(lobbyId: string): LobbyState | undefined {
    return this.lobbies.get(lobbyId);
  }

  public toLobbyView(lobby: LobbyState): LobbyView {
    const players = [...lobby.playersById.values()]
      .sort((a, b) => {
        if (a.joinedAtMs === b.joinedAtMs) {
          return a.playerId.localeCompare(b.playerId);
        }
        return a.joinedAtMs - b.joinedAtMs;
      })
      .map((player) => ({
        playerId: player.playerId,
        guestId: player.guestId,
        nickname: player.nickname,
        isHost: player.isHost,
        isReady: player.isReady,
        voteGameId: player.voteGameId,
        isConnected: player.isConnected,
      }));

    const votesByPlayerId: Record<string, string> = {};
    for (const [playerId, gameId] of lobby.votesByPlayerId.entries()) {
      votesByPlayerId[playerId] = gameId;
    }

    return {
      lobbyId: lobby.lobbyId,
      lobbyName: lobby.lobbyName,
      hostPlayerId: lobby.hostPlayerId,
      phase: lobby.phase,
      activeRoomId: lobby.activeRoomId,
      selectedGameId: lobby.selectedGameId,
      requiresPassword: lobby.passwordHash !== null,
      maxPlayers: lobby.maxPlayers,
      players,
      votesByPlayerId,
    };
  }

  public listLobbyViews(): LobbyDiscoveryView[] {
    return [...this.lobbies.values()]
      .map((lobby) => {
        const playerCount = lobby.playersById.size;
        let connectedCount = 0;
        for (const player of lobby.playersById.values()) {
          if (player.isConnected) {
            connectedCount += 1;
          }
        }

        return {
          lobbyId: lobby.lobbyId,
          lobbyName: lobby.lobbyName,
          phase: lobby.phase,
          activeRoomId: lobby.activeRoomId,
          selectedGameId: lobby.selectedGameId,
          requiresPassword: lobby.passwordHash !== null,
          maxPlayers: lobby.maxPlayers,
          playerCount,
          connectedCount,
          isJoinable: lobby.phase === 'waiting' && playerCount < lobby.maxPlayers,
          createdAtMs: lobby.createdAtMs,
          updatedAtMs: lobby.updatedAtMs,
        };
      })
      .sort((a, b) => a.lobbyId.localeCompare(b.lobbyId));
  }

  private requireLobby(lobbyId: string): LobbyState {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) {
      throw new LobbyServiceError('lobby_not_found', 'Lobby was not found.', { lobbyId });
    }

    return lobby;
  }

  private requirePlayer(lobby: LobbyState, playerId: string): LobbyPlayerState {
    const player = lobby.playersById.get(playerId);
    if (!player) {
      throw new LobbyServiceError('unauthorized', 'Player is not part of the lobby.', {
        lobbyId: lobby.lobbyId,
      });
    }

    return player;
  }

  private assignNewHost(lobby: LobbyState): void {
    const candidates = [...lobby.playersById.values()].sort((a, b) => {
      if (a.isConnected !== b.isConnected) {
        return a.isConnected ? -1 : 1;
      }

      if (a.joinedAtMs === b.joinedAtMs) {
        return a.playerId.localeCompare(b.playerId);
      }

      return a.joinedAtMs - b.joinedAtMs;
    });

    const nextHost = candidates.at(0);
    if (!nextHost) {
      throw new LobbyServiceError('invalid_state', 'Unable to assign host in a non-empty lobby.', {
        lobbyId: lobby.lobbyId,
      });
    }

    for (const player of lobby.playersById.values()) {
      player.isHost = player.playerId === nextHost.playerId;
    }

    lobby.hostPlayerId = nextHost.playerId;
  }
}
