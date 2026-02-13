export const DEFAULT_GATEWAY_WS_URL = 'ws://127.0.0.1:8787/ws' as const;
export const DEFAULT_GATEWAY_HTTP_URL = 'http://127.0.0.1:8787' as const;

export type GatewayUrlSource = 'env' | 'fallback';
export type GatewayHttpUrlSource = 'env' | 'derived' | 'fallback';

export interface ResolvedGatewayUrl {
  source: GatewayUrlSource;
  value: string;
}

export interface ResolvedGatewayHttpUrl {
  source: GatewayHttpUrlSource;
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

function trimTrailingSlash(value: string): string {
  if (value.length > 1 && value.endsWith('/')) {
    return value.slice(0, -1);
  }

  return value;
}

function deriveHttpUrlFromWebSocket(wsUrl: string): string {
  try {
    const url = new URL(wsUrl);
    if (url.protocol === 'ws:') {
      url.protocol = 'http:';
    } else if (url.protocol === 'wss:') {
      url.protocol = 'https:';
    }

    if (url.pathname.endsWith('/ws')) {
      url.pathname = url.pathname.slice(0, -3) || '/';
    }

    return trimTrailingSlash(url.toString());
  } catch {
    return DEFAULT_GATEWAY_HTTP_URL;
  }
}

export function resolveGatewayHttpUrl(): ResolvedGatewayHttpUrl {
  const fromEnv = process.env.NEXT_PUBLIC_GATEWAY_HTTP_URL?.trim();
  if (fromEnv && fromEnv.length > 0) {
    return {
      source: 'env',
      value: trimTrailingSlash(fromEnv),
    };
  }

  const resolvedWs = resolveGatewayWebSocketUrl();
  const derived = deriveHttpUrlFromWebSocket(resolvedWs.value);

  if (resolvedWs.source === 'env') {
    return {
      source: 'derived',
      value: derived,
    };
  }

  return {
    source: 'fallback',
    value: DEFAULT_GATEWAY_HTTP_URL,
  };
}
