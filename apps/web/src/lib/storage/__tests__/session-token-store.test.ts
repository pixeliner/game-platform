import { describe, expect, it, vi } from 'vitest';

import {
  getLobbySessionRecord,
  listLobbySessionRecords,
  removeLobbySessionRecord,
  setLobbySessionRecord,
} from '../session-token-store';

class MemoryStorage {
  private readonly data = new Map<string, string>();

  public getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  public setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

describe('session-token-store', () => {
  it('writes and reads records by lobby id', () => {
    const storage = new MemoryStorage();
    vi.spyOn(Date, 'now').mockReturnValue(1000);

    setLobbySessionRecord(
      {
        lobbyId: 'lobby_1',
        sessionToken: 'token_1',
        playerId: 'player_1',
        guestId: 'guest_1',
        expiresAtMs: 10_000,
      },
      storage,
    );

    const record = getLobbySessionRecord('lobby_1', storage);
    expect(record?.sessionToken).toBe('token_1');
    expect(record?.updatedAtMs).toBe(1000);
  });

  it('removes records and skips expired entries', () => {
    const storage = new MemoryStorage();
    vi.spyOn(Date, 'now').mockReturnValue(2000);

    setLobbySessionRecord(
      {
        lobbyId: 'lobby_active',
        sessionToken: 'token_active',
        playerId: 'player_active',
        guestId: 'guest_active',
        expiresAtMs: 8000,
      },
      storage,
    );

    setLobbySessionRecord(
      {
        lobbyId: 'lobby_expired',
        sessionToken: 'token_expired',
        playerId: 'player_expired',
        guestId: 'guest_expired',
        expiresAtMs: 1000,
      },
      storage,
    );

    const expired = getLobbySessionRecord('lobby_expired', storage);
    expect(expired).toBeNull();

    removeLobbySessionRecord('lobby_active', storage);
    expect(getLobbySessionRecord('lobby_active', storage)).toBeNull();

    const listed = listLobbySessionRecords(storage);
    expect(listed).toHaveLength(0);
  });
});
