import type { ClientMessage } from '@game-platform/protocol';

import type { LobbyService } from './lobby/lobby-service.js';
import type { RoomRuntimeManager } from './types.js';

export class GatewayMessageRouter {
  private readonly lobbyService: LobbyService;
  private readonly roomRuntimeManager: RoomRuntimeManager;

  public constructor(lobbyService: LobbyService, roomRuntimeManager: RoomRuntimeManager) {
    this.lobbyService = lobbyService;
    this.roomRuntimeManager = roomRuntimeManager;
  }

  public route(connectionId: string, message: ClientMessage): void {
    try {
      switch (message.type) {
        case 'lobby.create':
        case 'lobby.join':
        case 'lobby.leave':
        case 'lobby.chat.send':
        case 'lobby.vote.cast':
        case 'lobby.ready.set':
        case 'lobby.start.request':
          this.lobbyService.handleLobbyClientMessage(connectionId, message);
          return;
        case 'game.join':
        case 'game.spectate.join':
        case 'game.leave':
        case 'game.input':
          this.roomRuntimeManager.handleGameMessage(connectionId, message);
          return;
      }
    } catch (error) {
      this.lobbyService.sendServiceError(connectionId, error);
    }
  }
}
