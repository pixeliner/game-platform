import type { DatabaseSync } from 'node:sqlite';

const SCHEMA_STATEMENTS = [
  `
  PRAGMA foreign_keys = ON;
  `,
  `
  CREATE TABLE IF NOT EXISTS matches (
    match_id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL UNIQUE,
    lobby_id TEXT NOT NULL,
    game_id TEXT NOT NULL,
    seed INTEGER NOT NULL,
    tick_rate INTEGER NOT NULL,
    started_at_ms INTEGER NOT NULL,
    ended_at_ms INTEGER NOT NULL,
    end_reason TEXT NOT NULL,
    winner_player_id TEXT,
    winner_guest_id TEXT
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS match_players (
    match_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    guest_id TEXT NOT NULL,
    nickname TEXT NOT NULL,
    rank INTEGER NOT NULL,
    score INTEGER NOT NULL,
    alive INTEGER NOT NULL,
    eliminated_at_tick INTEGER,
    PRIMARY KEY (match_id, player_id),
    FOREIGN KEY (match_id) REFERENCES matches(match_id) ON DELETE CASCADE
  );
  `,
  `
  CREATE INDEX IF NOT EXISTS idx_matches_ended
  ON matches(ended_at_ms DESC, match_id DESC);
  `,
  `
  CREATE INDEX IF NOT EXISTS idx_matches_game_ended
  ON matches(game_id, ended_at_ms DESC, match_id DESC);
  `,
  `
  CREATE INDEX IF NOT EXISTS idx_match_players_guest
  ON match_players(guest_id);
  `,
  `
  CREATE INDEX IF NOT EXISTS idx_match_players_match
  ON match_players(match_id);
  `,
] as const;

export function applySqliteSchema(database: DatabaseSync): void {
  for (const statement of SCHEMA_STATEMENTS) {
    database.exec(statement);
  }
}
