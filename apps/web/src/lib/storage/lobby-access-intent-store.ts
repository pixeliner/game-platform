const LOBBY_ACCESS_INTENT_STORAGE_KEY = 'gp.lobby_access_intent.v1' as const;
const DEFAULT_INTENT_TTL_MS = 5 * 60 * 1000;

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface LobbyAccessIntentRecord {
  password: string;
  updatedAtMs: number;
  expiresAtMs: number;
}

interface LobbyAccessIntentState {
  create: LobbyAccessIntentRecord | null;
  joinByLobbyId: Record<string, LobbyAccessIntentRecord>;
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

function createEmptyState(): LobbyAccessIntentState {
  return {
    create: null,
    joinByLobbyId: {},
  };
}

function loadState(storage?: StorageLike): LobbyAccessIntentState {
  const targetStorage = resolveStorage(storage);
  if (!targetStorage) {
    return createEmptyState();
  }

  const raw = targetStorage.getItem(LOBBY_ACCESS_INTENT_STORAGE_KEY);
  if (!raw) {
    return createEmptyState();
  }

  try {
    const parsed = JSON.parse(raw) as Partial<LobbyAccessIntentState>;
    const create = parsed.create && typeof parsed.create === 'object'
      ? parsed.create
      : null;
    const joinByLobbyId =
      parsed.joinByLobbyId && typeof parsed.joinByLobbyId === 'object'
        ? parsed.joinByLobbyId
        : {};

    return {
      create:
        create &&
        typeof create.password === 'string' &&
        typeof create.updatedAtMs === 'number' &&
        typeof create.expiresAtMs === 'number'
          ? create
          : null,
      joinByLobbyId: Object.fromEntries(
        Object.entries(joinByLobbyId).filter((entry): entry is [string, LobbyAccessIntentRecord] => {
          const value = entry[1] as Partial<LobbyAccessIntentRecord>;
          return (
            value &&
            typeof value.password === 'string' &&
            typeof value.updatedAtMs === 'number' &&
            typeof value.expiresAtMs === 'number'
          );
        }),
      ),
    };
  } catch {
    return createEmptyState();
  }
}

function persistState(state: LobbyAccessIntentState, storage?: StorageLike): void {
  const targetStorage = resolveStorage(storage);
  if (!targetStorage) {
    return;
  }

  targetStorage.setItem(LOBBY_ACCESS_INTENT_STORAGE_KEY, JSON.stringify(state));
}

function isExpired(record: LobbyAccessIntentRecord): boolean {
  return record.expiresAtMs <= Date.now();
}

function cleanupExpired(state: LobbyAccessIntentState): LobbyAccessIntentState {
  const nextState: LobbyAccessIntentState = {
    create: state.create,
    joinByLobbyId: { ...state.joinByLobbyId },
  };

  if (nextState.create && isExpired(nextState.create)) {
    nextState.create = null;
  }

  for (const [lobbyId, record] of Object.entries(nextState.joinByLobbyId)) {
    if (isExpired(record)) {
      delete nextState.joinByLobbyId[lobbyId];
    }
  }

  return nextState;
}

function createRecord(password: string, ttlMs: number): LobbyAccessIntentRecord {
  const nowMs = Date.now();
  return {
    password,
    updatedAtMs: nowMs,
    expiresAtMs: nowMs + ttlMs,
  };
}

export function setCreateLobbyAccessIntent(
  password: string,
  options?: { ttlMs?: number; storage?: StorageLike },
): void {
  const ttlMs = options?.ttlMs ?? DEFAULT_INTENT_TTL_MS;
  const state = cleanupExpired(loadState(options?.storage));
  state.create = createRecord(password, ttlMs);
  persistState(state, options?.storage);
}

export function clearCreateLobbyAccessIntent(storage?: StorageLike): void {
  const state = cleanupExpired(loadState(storage));
  if (!state.create) {
    return;
  }

  state.create = null;
  persistState(state, storage);
}

export function consumeCreateLobbyAccessIntent(storage?: StorageLike): LobbyAccessIntentRecord | null {
  const state = cleanupExpired(loadState(storage));
  const current = state.create;
  state.create = null;
  persistState(state, storage);
  return current;
}

export function setJoinLobbyAccessIntent(
  lobbyId: string,
  password: string,
  options?: { ttlMs?: number; storage?: StorageLike },
): void {
  const ttlMs = options?.ttlMs ?? DEFAULT_INTENT_TTL_MS;
  const state = cleanupExpired(loadState(options?.storage));
  state.joinByLobbyId[lobbyId] = createRecord(password, ttlMs);
  persistState(state, options?.storage);
}

export function clearJoinLobbyAccessIntent(lobbyId: string, storage?: StorageLike): void {
  const state = cleanupExpired(loadState(storage));
  if (!(lobbyId in state.joinByLobbyId)) {
    return;
  }

  delete state.joinByLobbyId[lobbyId];
  persistState(state, storage);
}

export function consumeJoinLobbyAccessIntent(
  lobbyId: string,
  storage?: StorageLike,
): LobbyAccessIntentRecord | null {
  const state = cleanupExpired(loadState(storage));
  const current = state.joinByLobbyId[lobbyId] ?? null;

  if (current) {
    delete state.joinByLobbyId[lobbyId];
    persistState(state, storage);
    return current;
  }

  persistState(state, storage);
  return null;
}

export function lobbyAccessIntentStorageKey(): string {
  return LOBBY_ACCESS_INTENT_STORAGE_KEY;
}
