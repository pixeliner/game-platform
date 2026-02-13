import { describe, expect, it } from 'vitest';

import { parseAdminDebugCommand } from '../debug-command-parser';

describe('debug-command-parser', () => {
  it('parses tick-rate command within bounds', () => {
    const parsed = parseAdminDebugCommand('/tickrate 30');

    expect(parsed).toEqual({
      ok: true,
      value: {
        kind: 'tick_rate.set',
        tickRate: 30,
      },
    });
  });

  it('rejects tick-rate command outside bounds', () => {
    const parsed = parseAdminDebugCommand('/tickrate 100');

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error).toContain('Tick rate must be between');
    }
  });

  it('parses kick command with optional reason', () => {
    const parsed = parseAdminDebugCommand('/kick player_2 afk timeout');

    expect(parsed).toEqual({
      ok: true,
      value: {
        kind: 'kick',
        targetPlayerId: 'player_2',
        reason: 'afk timeout',
      },
    });
  });

  it('parses control commands', () => {
    expect(parseAdminDebugCommand('/force-start')).toEqual({
      ok: true,
      value: {
        kind: 'start.force',
      },
    });
    expect(parseAdminDebugCommand('/pause')).toEqual({
      ok: true,
      value: {
        kind: 'room.pause',
      },
    });
    expect(parseAdminDebugCommand('/resume')).toEqual({
      ok: true,
      value: {
        kind: 'room.resume',
      },
    });
    expect(parseAdminDebugCommand('/stop maintenance')).toEqual({
      ok: true,
      value: {
        kind: 'room.stop',
        reason: 'maintenance',
      },
    });
    expect(parseAdminDebugCommand('/force-end')).toEqual({
      ok: true,
      value: {
        kind: 'room.force_end',
      },
    });
    expect(parseAdminDebugCommand('/monitor')).toEqual({
      ok: true,
      value: {
        kind: 'monitor.request',
      },
    });
  });

  it('rejects unknown or malformed commands', () => {
    expect(parseAdminDebugCommand('tickrate 20').ok).toBe(false);
    expect(parseAdminDebugCommand('/unknown').ok).toBe(false);
    expect(parseAdminDebugCommand('/kick').ok).toBe(false);
  });
});
