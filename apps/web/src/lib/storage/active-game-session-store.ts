const ACTIVE_GAME_SESSION_STORAGE_KEY = 'gp.active_games.v1' as const;

export type ActiveGameSessionMode = 'player' | 'spectator';

export interface ActiveGameSessionRecord {
  roomId: string;
  lobbyId: string;
  mode: ActiveGameSessionMode;
  updatedAtMs: number;
  expiresAtMs: number;
}

interface ActiveGameSessionRecordMap {
  [roomId: string]: ActiveGameSessionRecord;
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

function loadMap(storage?: StorageLike): ActiveGameSessionRecordMap {
  const targetStorage = resolveStorage(storage);
  if (!targetStorage) {
    return {};
  }

  const raw = targetStorage.getItem(ACTIVE_GAME_SESSION_STORAGE_KEY);
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, ActiveGameSessionRecord>;
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }

    return {};
  } catch {
    return {};
  }
}

function persistMap(map: ActiveGameSessionRecordMap, storage?: StorageLike): void {
  const targetStorage = resolveStorage(storage);
  if (!targetStorage) {
    return;
  }

  targetStorage.setItem(ACTIVE_GAME_SESSION_STORAGE_KEY, JSON.stringify(map));
}

export function getActiveGameSessionRecord(roomId: string, storage?: StorageLike): ActiveGameSessionRecord | null {
  const map = loadMap(storage);
  const record = map[roomId];

  if (!record) {
    return null;
  }

  if (record.expiresAtMs <= Date.now()) {
    removeActiveGameSessionRecord(roomId, storage);
    return null;
  }

  return record;
}

export function setActiveGameSessionRecord(
  input: Omit<ActiveGameSessionRecord, 'updatedAtMs'>,
  storage?: StorageLike,
): ActiveGameSessionRecord {
  const record: ActiveGameSessionRecord = {
    ...input,
    updatedAtMs: Date.now(),
  };

  const map = loadMap(storage);
  map[input.roomId] = record;
  persistMap(map, storage);

  return record;
}

export function removeActiveGameSessionRecord(roomId: string, storage?: StorageLike): void {
  const map = loadMap(storage);
  if (!(roomId in map)) {
    return;
  }

  delete map[roomId];
  persistMap(map, storage);
}

export function activeGameSessionStorageKey(): string {
  return ACTIVE_GAME_SESSION_STORAGE_KEY;
}
