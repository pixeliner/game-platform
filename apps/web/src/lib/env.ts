export const DEFAULT_GATEWAY_WS_URL = 'ws://127.0.0.1:8787/ws' as const;

export type GatewayUrlSource = 'env' | 'fallback';

export interface ResolvedGatewayUrl {
  source: GatewayUrlSource;
  value: string;
}

export function resolveGatewayWebSocketUrl(): ResolvedGatewayUrl {
  const fromEnv = process.env.NEXT_PUBLIC_GATEWAY_WS_URL?.trim();

  if (fromEnv && fromEnv.length > 0) {
    return {
      source: 'env',
      value: fromEnv,
    };
  }

  return {
    source: 'fallback',
    value: DEFAULT_GATEWAY_WS_URL,
  };
}
