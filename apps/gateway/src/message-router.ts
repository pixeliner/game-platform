import type { ClientMessage } from '@game-platform/protocol';

import type { LobbyService } from './lobby/lobby-service.js';

export class GatewayMessageRouter {
  private readonly lobbyService: LobbyService;

  public constructor(lobbyService: LobbyService) {
    this.lobbyService = lobbyService;
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
        case 'game.leave':
        case 'game.input':
          this.lobbyService.sendUnsupportedMessage(connectionId, message.type);
          return;
      }
    } catch (error) {
      this.lobbyService.sendServiceError(connectionId, error);
    }
  }
}
