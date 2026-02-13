import type { EntityId } from './types.js';

export class ComponentStore<TComponent> {
  private readonly componentsByEntityId = new Map<EntityId, TComponent>();

  public add(entityId: EntityId, component: TComponent): void {
    if (this.componentsByEntityId.has(entityId)) {
      throw new Error(`Component already exists for entity ${entityId}.`);
    }

    this.componentsByEntityId.set(entityId, component);
  }

  public set(entityId: EntityId, component: TComponent): void {
    this.componentsByEntityId.set(entityId, component);
  }

  public get(entityId: EntityId): TComponent | undefined {
    return this.componentsByEntityId.get(entityId);
  }

  public has(entityId: EntityId): boolean {
    return this.componentsByEntityId.has(entityId);
  }

  public remove(entityId: EntityId): boolean {
    return this.componentsByEntityId.delete(entityId);
  }

  public clear(): void {
    this.componentsByEntityId.clear();
  }

  public entries(): IterableIterator<[EntityId, TComponent]> {
    return this.componentsByEntityId.entries();
  }
}
