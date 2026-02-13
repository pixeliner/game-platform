import { createHmac, timingSafeEqual } from 'node:crypto';

import type { ReconnectClaims, SessionTokenService } from '../types.js';

const TOKEN_VERSION = 1;

interface TokenPayload extends ReconnectClaims {
  v: number;
  sid: string;
  exp: number;
}

interface SessionTokenServiceOptions {
  secret: string;
  ttlMs: number;
  nowMs: () => number;
  nextSessionId: () => string;
}

function encodeBase64Url(data: string): string {
  return Buffer.from(data, 'utf8').toString('base64url');
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data, 'base64url').toString('utf8');
}

function signPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function createSessionTokenService(options: SessionTokenServiceOptions): SessionTokenService {
  return {
    issueSessionToken(input): { sessionToken: string; expiresAtMs: number } {
      const expiresAtMs = options.nowMs() + options.ttlMs;
      const payload: TokenPayload = {
        v: TOKEN_VERSION,
        sid: options.nextSessionId(),
        lobbyId: input.lobbyId,
        playerId: input.playerId,
        guestId: input.guestId,
        exp: expiresAtMs,
      };

      const payloadRaw = JSON.stringify(payload);
      const payloadEncoded = encodeBase64Url(payloadRaw);
      const signature = signPayload(payloadEncoded, options.secret);

      return {
        sessionToken: `${payloadEncoded}.${signature}`,
        expiresAtMs,
      };
    },

    verifySessionToken(token): ReconnectClaims | null {
      const [payloadEncoded, signatureEncoded, ...rest] = token.split('.');
      if (!payloadEncoded || !signatureEncoded || rest.length > 0) {
        return null;
      }

      const expectedSignature = signPayload(payloadEncoded, options.secret);
      const signatureBuffer = Buffer.from(signatureEncoded, 'utf8');
      const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
      if (signatureBuffer.length !== expectedBuffer.length) {
        return null;
      }

      if (!timingSafeEqual(signatureBuffer, expectedBuffer)) {
        return null;
      }

      let payload: TokenPayload;
      try {
        payload = JSON.parse(decodeBase64Url(payloadEncoded)) as TokenPayload;
      } catch {
        return null;
      }

      if (payload.v !== TOKEN_VERSION) {
        return null;
      }

      if (!payload.sid || !payload.lobbyId || !payload.playerId || !payload.guestId) {
        return null;
      }

      if (!Number.isFinite(payload.exp) || payload.exp <= options.nowMs()) {
        return null;
      }

      return {
        lobbyId: payload.lobbyId,
        playerId: payload.playerId,
        guestId: payload.guestId,
      };
    },
  };
}
