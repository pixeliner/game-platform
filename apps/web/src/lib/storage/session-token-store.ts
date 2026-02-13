const SESSION_STORAGE_KEY = 'gp.sessions.v1' as const;

export interface LobbySessionRecord {
  lobbyId: string;
  sessionToken: string;
  playerId: string;
  guestId: string;
  expiresAtMs: number;
  updatedAtMs: number;
}

interface SessionRecordMap {
  [lobbyId: string]: LobbySessionRecord;
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

function loadMap(storage?: StorageLike): SessionRecordMap {
  const targetStorage = resolveStorage(storage);
  if (!targetStorage) {
    return {};
  }

  const raw = targetStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, LobbySessionRecord>;
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }

    return {};
  } catch {
    return {};
  }
}

function persistMap(map: SessionRecordMap, storage?: StorageLike): void {
  const targetStorage = resolveStorage(storage);
  if (!targetStorage) {
    return;
  }

  targetStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(map));
}

export function getLobbySessionRecord(lobbyId: string, storage?: StorageLike): LobbySessionRecord | null {
  const map = loadMap(storage);
  const record = map[lobbyId];

  if (!record) {
    return null;
  }

  if (record.expiresAtMs <= Date.now()) {
    removeLobbySessionRecord(lobbyId, storage);
    return null;
  }

  return record;
}

export function setLobbySessionRecord(
  input: Omit<LobbySessionRecord, 'updatedAtMs'>,
  storage?: StorageLike,
): LobbySessionRecord {
  const record: LobbySessionRecord = {
    ...input,
    updatedAtMs: Date.now(),
  };

  const map = loadMap(storage);
  map[input.lobbyId] = record;
  persistMap(map, storage);

  return record;
}

export function removeLobbySessionRecord(lobbyId: string, storage?: StorageLike): void {
  const map = loadMap(storage);
  if (!(lobbyId in map)) {
    return;
  }

  delete map[lobbyId];
  persistMap(map, storage);
}

export function listLobbySessionRecords(storage?: StorageLike): LobbySessionRecord[] {
  const map = loadMap(storage);

  return Object.values(map)
    .filter((record) => record.expiresAtMs > Date.now())
    .sort((a, b) => b.updatedAtMs - a.updatedAtMs);
}

export function sessionTokenStorageKey(): string {
  return SESSION_STORAGE_KEY;
}
