import type { ZodIssue } from 'zod';

import { protocolMessageSchema, type ProtocolMessage } from './messages.js';

export type ProtocolDecodeErrorCode = 'invalid_json' | 'invalid_message';

interface ProtocolDecodeErrorOptions {
  cause?: unknown;
  issues?: ZodIssue[];
}

export class ProtocolDecodeError extends Error {
  public readonly code: ProtocolDecodeErrorCode;
  public readonly issues: ZodIssue[] | undefined;

  public constructor(code: ProtocolDecodeErrorCode, message: string, options?: ProtocolDecodeErrorOptions) {
    super(message, { cause: options?.cause });
    this.name = 'ProtocolDecodeError';
    this.code = code;
    this.issues = options?.issues;
  }
}

export type SafeDecodeResult =
  | {
      ok: true;
      value: ProtocolMessage;
    }
  | {
      ok: false;
      error: ProtocolDecodeError;
    };

export function encodeMessage(message: ProtocolMessage): string {
  const validated = protocolMessageSchema.parse(message);
  return JSON.stringify(validated);
}

export function decodeMessage(raw: string): ProtocolMessage {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new ProtocolDecodeError('invalid_json', 'Failed to parse protocol message JSON.', {
      cause: error,
    });
  }

  const result = protocolMessageSchema.safeParse(parsed);
  if (!result.success) {
    throw new ProtocolDecodeError('invalid_message', 'Decoded JSON failed protocol validation.', {
      issues: result.error.issues,
    });
  }

  return result.data;
}

export function safeDecodeMessage(raw: string): SafeDecodeResult {
  try {
    return {
      ok: true,
      value: decodeMessage(raw),
    };
  } catch (error) {
    if (error instanceof ProtocolDecodeError) {
      return {
        ok: false,
        error,
      };
    }

    return {
      ok: false,
      error: new ProtocolDecodeError('invalid_message', 'Unexpected protocol decode failure.', {
        cause: error,
      }),
    };
  }
}
