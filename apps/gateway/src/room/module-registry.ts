import type { GameModule } from '@game-platform/engine';
import { GAME_ID_BOMBERMAN, bombermanModule } from '@game-platform/game-bomberman';

export type AnyGameModule = GameModule<unknown, unknown, unknown, unknown, unknown>;

export class ModuleRegistry {
  private readonly modulesByGameId = new Map<string, AnyGameModule>();

  public register(module: AnyGameModule): void {
    this.modulesByGameId.set(module.gameId, module);
  }

  public get(gameId: string): AnyGameModule | undefined {
    return this.modulesByGameId.get(gameId);
  }
}

export function createDefaultModuleRegistry(): ModuleRegistry {
  const registry = new ModuleRegistry();
  registry.register({
    ...bombermanModule,
    gameId: GAME_ID_BOMBERMAN,
  });
  return registry;
}
