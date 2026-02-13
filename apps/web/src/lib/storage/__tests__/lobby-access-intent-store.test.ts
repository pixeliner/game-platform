import { describe, expect, it, vi } from 'vitest';

import {
  clearCreateLobbyAccessIntent,
  clearJoinLobbyAccessIntent,
  consumeCreateLobbyAccessIntent,
  consumeJoinLobbyAccessIntent,
  setCreateLobbyAccessIntent,
  setJoinLobbyAccessIntent,
} from '../lobby-access-intent-store';

class MemoryStorage {
  private readonly data = new Map<string, string>();

  public getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  public setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

describe('lobby-access-intent-store', () => {
  it('stores and consumes create-lobby password intents', () => {
    const storage = new MemoryStorage();
    vi.spyOn(Date, 'now').mockReturnValue(1_000);

    setCreateLobbyAccessIntent('secret', { storage });

    const consumed = consumeCreateLobbyAccessIntent(storage);
    expect(consumed?.password).toBe('secret');
    expect(consumed?.updatedAtMs).toBe(1_000);

    const secondConsume = consumeCreateLobbyAccessIntent(storage);
    expect(secondConsume).toBeNull();
  });

  it('stores and consumes join-lobby intents by lobby id', () => {
    const storage = new MemoryStorage();
    vi.spyOn(Date, 'now').mockReturnValue(2_000);

    setJoinLobbyAccessIntent('lobby-1', 'join-secret', { storage });

    const consumed = consumeJoinLobbyAccessIntent('lobby-1', storage);
    expect(consumed?.password).toBe('join-secret');
    expect(consumeJoinLobbyAccessIntent('lobby-1', storage)).toBeNull();
  });

  it('expires and clears intents', () => {
    const storage = new MemoryStorage();
    vi.spyOn(Date, 'now').mockReturnValue(3_000);

    setCreateLobbyAccessIntent('secret', { storage, ttlMs: 100 });
    setJoinLobbyAccessIntent('lobby-2', 'join-secret', { storage, ttlMs: 100 });

    vi.spyOn(Date, 'now').mockReturnValue(3_101);
    expect(consumeCreateLobbyAccessIntent(storage)).toBeNull();
    expect(consumeJoinLobbyAccessIntent('lobby-2', storage)).toBeNull();

    vi.spyOn(Date, 'now').mockReturnValue(4_000);
    setCreateLobbyAccessIntent('new-secret', { storage });
    setJoinLobbyAccessIntent('lobby-3', 'new-join-secret', { storage });

    clearCreateLobbyAccessIntent(storage);
    clearJoinLobbyAccessIntent('lobby-3', storage);

    expect(consumeCreateLobbyAccessIntent(storage)).toBeNull();
    expect(consumeJoinLobbyAccessIntent('lobby-3', storage)).toBeNull();
  });
});
