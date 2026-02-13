import { describe, expect, it, vi } from 'vitest';

import {
  getActiveGameSessionRecord,
  removeActiveGameSessionRecord,
  setActiveGameSessionRecord,
} from '../active-game-session-store';

class MemoryStorage {
  private readonly data = new Map<string, string>();

  public getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  public setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

describe('active-game-session-store', () => {
  it('writes and reads records by room id', () => {
    const storage = new MemoryStorage();
    vi.spyOn(Date, 'now').mockReturnValue(10_000);

    setActiveGameSessionRecord(
      {
        roomId: 'room_1',
        lobbyId: 'lobby_1',
        mode: 'player',
        expiresAtMs: 20_000,
      },
      storage,
    );

    const record = getActiveGameSessionRecord('room_1', storage);
    expect(record?.roomId).toBe('room_1');
    expect(record?.lobbyId).toBe('lobby_1');
    expect(record?.mode).toBe('player');
    expect(record?.updatedAtMs).toBe(10_000);
  });

  it('removes and expires records', () => {
    const storage = new MemoryStorage();
    vi.spyOn(Date, 'now').mockReturnValue(1_000);

    setActiveGameSessionRecord(
      {
        roomId: 'room_active',
        lobbyId: 'lobby_1',
        mode: 'spectator',
        expiresAtMs: 10_000,
      },
      storage,
    );

    setActiveGameSessionRecord(
      {
        roomId: 'room_expired',
        lobbyId: 'lobby_2',
        mode: 'player',
        expiresAtMs: 500,
      },
      storage,
    );

    expect(getActiveGameSessionRecord('room_expired', storage)).toBeNull();

    removeActiveGameSessionRecord('room_active', storage);
    expect(getActiveGameSessionRecord('room_active', storage)).toBeNull();
  });
});
