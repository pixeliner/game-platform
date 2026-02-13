export interface GameCatalogEntry {
  gameId: string;
  label: string;
  description: string;
}

export const GAME_CATALOG: ReadonlyArray<GameCatalogEntry> = [
  {
    gameId: 'bomberman',
    label: 'Bomberman',
    description: 'Classic grid-based bomb battle with deterministic server simulation.',
  },
];

export function findGameCatalogEntry(gameId: string): GameCatalogEntry | undefined {
  return GAME_CATALOG.find((entry) => entry.gameId === gameId);
}
