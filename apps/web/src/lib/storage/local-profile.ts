const LOCAL_PROFILE_STORAGE_KEY = 'gp.profile.v1' as const;

export interface LocalProfile {
  guestId: string;
  nickname: string;
  updatedAtMs: number;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function resolveStorage(storage?: StorageLike): StorageLike | null {
  if (storage) {
    return storage;
  }

  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function nextGuestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `guest_${Math.random().toString(16).slice(2)}`;
}

export function loadLocalProfile(storage?: StorageLike): LocalProfile | null {
  const targetStorage = resolveStorage(storage);
  if (!targetStorage) {
    return null;
  }

  const raw = targetStorage.getItem(LOCAL_PROFILE_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<LocalProfile>;
    if (
      typeof parsed.guestId !== 'string' ||
      typeof parsed.nickname !== 'string' ||
      typeof parsed.updatedAtMs !== 'number'
    ) {
      return null;
    }

    return {
      guestId: parsed.guestId,
      nickname: parsed.nickname,
      updatedAtMs: parsed.updatedAtMs,
    };
  } catch {
    return null;
  }
}

export function saveLocalProfile(profile: LocalProfile, storage?: StorageLike): LocalProfile {
  const targetStorage = resolveStorage(storage);
  if (!targetStorage) {
    return profile;
  }

  targetStorage.setItem(LOCAL_PROFILE_STORAGE_KEY, JSON.stringify(profile));
  return profile;
}

export function ensureLocalProfile(nicknameHint?: string, storage?: StorageLike): LocalProfile {
  const existing = loadLocalProfile(storage);
  const nowMs = Date.now();

  if (existing) {
    const normalizedNickname = nicknameHint?.trim();
    if (normalizedNickname && normalizedNickname.length > 0 && normalizedNickname !== existing.nickname) {
      const updated: LocalProfile = {
        ...existing,
        nickname: normalizedNickname,
        updatedAtMs: nowMs,
      };

      return saveLocalProfile(updated, storage);
    }

    return existing;
  }

  const created: LocalProfile = {
    guestId: nextGuestId(),
    nickname: nicknameHint?.trim() || 'LanPlayer',
    updatedAtMs: nowMs,
  };

  return saveLocalProfile(created, storage);
}

export function localProfileStorageKey(): string {
  return LOCAL_PROFILE_STORAGE_KEY;
}
