import {
  ADMIN_TICK_RATE_MAX,
  ADMIN_TICK_RATE_MIN,
} from '@game-platform/protocol';

export type AdminDebugCommand =
  | {
      kind: 'tick_rate.set';
      tickRate: number;
    }
  | {
      kind: 'kick';
      targetPlayerId: string;
      reason?: string;
    }
  | {
      kind: 'start.force';
    }
  | {
      kind: 'room.pause';
    }
  | {
      kind: 'room.resume';
    }
  | {
      kind: 'room.stop';
      reason?: string;
    }
  | {
      kind: 'room.force_end';
    }
  | {
      kind: 'monitor.request';
    };

export type ParseAdminDebugCommandResult =
  | {
      ok: true;
      value: AdminDebugCommand;
    }
  | {
      ok: false;
      error: string;
    };

function toNonEmptyText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function parseAdminDebugCommand(raw: string): ParseAdminDebugCommandResult {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return {
      ok: false,
      error: 'Command is empty.',
    };
  }

  if (!trimmed.startsWith('/')) {
    return {
      ok: false,
      error: 'Commands must start with /.',
    };
  }

  const tokens = trimmed.split(/\s+/);
  const command = tokens[0] ?? '';

  switch (command) {
    case '/tickrate': {
      const value = tokens[1];
      if (!value) {
        return {
          ok: false,
          error: `Usage: /tickrate <${ADMIN_TICK_RATE_MIN}-${ADMIN_TICK_RATE_MAX}>`,
        };
      }

      const tickRate = Number.parseInt(value, 10);
      if (!Number.isInteger(tickRate) || tickRate < ADMIN_TICK_RATE_MIN || tickRate > ADMIN_TICK_RATE_MAX) {
        return {
          ok: false,
          error: `Tick rate must be between ${ADMIN_TICK_RATE_MIN} and ${ADMIN_TICK_RATE_MAX}.`,
        };
      }

      return {
        ok: true,
        value: {
          kind: 'tick_rate.set',
          tickRate,
        },
      };
    }

    case '/kick': {
      const targetPlayerId = toNonEmptyText(tokens[1] ?? '');
      if (!targetPlayerId) {
        return {
          ok: false,
          error: 'Usage: /kick <playerId> [reason]',
        };
      }

      const reason = toNonEmptyText(tokens.slice(2).join(' '));
      return {
        ok: true,
        value: {
          kind: 'kick',
          targetPlayerId,
          ...(reason ? { reason } : {}),
        },
      };
    }

    case '/force-start':
      return {
        ok: true,
        value: {
          kind: 'start.force',
        },
      };

    case '/pause':
      return {
        ok: true,
        value: {
          kind: 'room.pause',
        },
      };

    case '/resume':
      return {
        ok: true,
        value: {
          kind: 'room.resume',
        },
      };

    case '/stop': {
      const reason = toNonEmptyText(tokens.slice(1).join(' '));
      return {
        ok: true,
        value: {
          kind: 'room.stop',
          ...(reason ? { reason } : {}),
        },
      };
    }

    case '/force-end':
      return {
        ok: true,
        value: {
          kind: 'room.force_end',
        },
      };

    case '/monitor':
      return {
        ok: true,
        value: {
          kind: 'monitor.request',
        },
      };

    default:
      return {
        ok: false,
        error: `Unknown command: ${command}`,
      };
  }
}
