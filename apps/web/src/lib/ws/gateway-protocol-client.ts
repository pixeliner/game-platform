import {
  encodeMessage,
  safeDecodeMessage,
  serverMessageSchema,
  type ClientMessage,
  type ServerMessage,
} from '@game-platform/protocol';

export type GatewayProtocolClientStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'closed'
  | 'error';

export interface GatewayProtocolClientCloseMeta {
  code: number;
  reason: string;
  wasClean: boolean;
}

export interface GatewayProtocolClientHandlers {
  onStatusChange?: (status: GatewayProtocolClientStatus) => void;
  onMessage?: (message: ServerMessage) => void;
  onClientError?: (message: string) => void;
  onClose?: (meta: GatewayProtocolClientCloseMeta) => void;
}

function rawEventDataToText(data: string | ArrayBuffer | Blob): Promise<string> {
  if (typeof data === 'string') {
    return Promise.resolve(data);
  }

  if (data instanceof ArrayBuffer) {
    const decoder = new TextDecoder();
    return Promise.resolve(decoder.decode(data));
  }

  return data.text();
}

export class GatewayProtocolClient {
  private socket: WebSocket | null = null;
  private handlers: GatewayProtocolClientHandlers;
  private manualClose = false;

  public constructor(
    private readonly gatewayUrl: string,
    handlers: GatewayProtocolClientHandlers = {},
  ) {
    this.handlers = handlers;
  }

  public setHandlers(nextHandlers: GatewayProtocolClientHandlers): void {
    this.handlers = nextHandlers;
  }

  public connect(): void {
    if (
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.manualClose = false;
    this.handlers.onStatusChange?.('connecting');

    const socket = new WebSocket(this.gatewayUrl);
    this.socket = socket;

    socket.addEventListener('open', () => {
      if (this.socket !== socket) {
        return;
      }

      this.handlers.onStatusChange?.('connected');
    });

    socket.addEventListener('message', async (event) => {
      if (this.socket !== socket) {
        return;
      }

      const rawText = await rawEventDataToText(event.data);
      const decoded = safeDecodeMessage(rawText);
      if (!decoded.ok) {
        this.handlers.onClientError?.(decoded.error.message);
        return;
      }

      const parsed = serverMessageSchema.safeParse(decoded.value);
      if (!parsed.success) {
        this.handlers.onClientError?.('Received a message that is not a valid server message.');
        return;
      }

      this.handlers.onMessage?.(parsed.data);
    });

    socket.addEventListener('error', () => {
      if (this.socket !== socket || this.manualClose) {
        return;
      }

      this.handlers.onStatusChange?.('error');
      this.handlers.onClientError?.('WebSocket transport error.');
    });

    socket.addEventListener('close', (event) => {
      if (this.socket === socket) {
        this.socket = null;
      }

      this.handlers.onStatusChange?.('closed');
      this.handlers.onClose?.({
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
      });
    });
  }

  public disconnect(reason = 'manual_disconnect'): void {
    this.manualClose = true;

    if (!this.socket) {
      return;
    }

    if (
      this.socket.readyState === WebSocket.OPEN ||
      this.socket.readyState === WebSocket.CONNECTING
    ) {
      this.socket.close(1000, reason);
    }
  }

  public isManualClose(): boolean {
    return this.manualClose;
  }

  public send(message: ClientMessage): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('Cannot send message while websocket is not open.');
    }

    this.socket.send(encodeMessage(message));
  }
}
