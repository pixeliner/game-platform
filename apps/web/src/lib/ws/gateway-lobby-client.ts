import {
  lobbyServerMessageSchema,
  type LobbyClientMessage,
  type LobbyServerMessage,
} from '@game-platform/protocol';

import {
  GatewayProtocolClient,
  type GatewayProtocolClientCloseMeta,
  type GatewayProtocolClientStatus,
} from './gateway-protocol-client';

export type GatewayLobbyClientStatus =
  GatewayProtocolClientStatus;

export type GatewayLobbyClientCloseMeta = GatewayProtocolClientCloseMeta;

export interface GatewayLobbyClientHandlers {
  onStatusChange?: (status: GatewayLobbyClientStatus) => void;
  onMessage?: (message: LobbyServerMessage) => void;
  onClientError?: (message: string) => void;
  onClose?: (meta: GatewayLobbyClientCloseMeta) => void;
}

export class GatewayLobbyClient {
  private readonly baseClient: GatewayProtocolClient;
  private handlers: GatewayLobbyClientHandlers;

  public constructor(gatewayUrl: string, handlers: GatewayLobbyClientHandlers = {}) {
    this.handlers = handlers;
    this.baseClient = new GatewayProtocolClient(gatewayUrl, {
      onStatusChange: (status): void => {
        this.handlers.onStatusChange?.(status);
      },
      onMessage: (message): void => {
        const parsed = lobbyServerMessageSchema.safeParse(message);
        if (!parsed.success) {
          return;
        }

        this.handlers.onMessage?.(parsed.data);
      },
      onClientError: (message): void => {
        this.handlers.onClientError?.(message);
      },
      onClose: (meta): void => {
        this.handlers.onClose?.(meta);
      },
    });
  }

  public setHandlers(nextHandlers: GatewayLobbyClientHandlers): void {
    this.handlers = nextHandlers;
    this.baseClient.setHandlers({
      onStatusChange: (status): void => {
        this.handlers.onStatusChange?.(status);
      },
      onMessage: (message): void => {
        const parsed = lobbyServerMessageSchema.safeParse(message);
        if (!parsed.success) {
          return;
        }

        this.handlers.onMessage?.(parsed.data);
      },
      onClientError: (message): void => {
        this.handlers.onClientError?.(message);
      },
      onClose: (meta): void => {
        this.handlers.onClose?.(meta);
      },
    });
  }

  public connect(): void {
    this.baseClient.connect();
  }

  public disconnect(reason = 'manual_disconnect'): void {
    this.baseClient.disconnect(reason);
  }

  public isManualClose(): boolean {
    return this.baseClient.isManualClose();
  }

  public send(message: LobbyClientMessage): void {
    this.baseClient.send(message);
  }
}
