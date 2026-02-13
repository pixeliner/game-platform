import { ComponentStore } from './component-store.js';
import type { ComponentKey, ComponentMap, EntityId, QueryOptions } from './types.js';

export class EcsWorld<TComponents extends ComponentMap> {
  private nextEntityId: EntityId = 1;
  private readonly aliveEntityIds = new Set<EntityId>();
  private readonly entityCreationOrder: EntityId[] = [];
  private readonly componentStores = new Map<ComponentKey<TComponents>, ComponentStore<unknown>>();

  public createEntity(): EntityId {
    const entityId = this.nextEntityId;
    this.nextEntityId += 1;

    this.aliveEntityIds.add(entityId);
    this.entityCreationOrder.push(entityId);

    return entityId;
  }

  public destroyEntity(entityId: EntityId): boolean {
    if (!this.aliveEntityIds.has(entityId)) {
      return false;
    }

    this.aliveEntityIds.delete(entityId);
    for (const store of this.componentStores.values()) {
      store.remove(entityId);
    }

    return true;
  }

  public isAlive(entityId: EntityId): boolean {
    return this.aliveEntityIds.has(entityId);
  }

  public addComponent<TKey extends ComponentKey<TComponents>>(
    entityId: EntityId,
    key: TKey,
    component: TComponents[TKey],
  ): void {
    this.requireAlive(entityId);
    this.getStore(key).add(entityId, component);
  }

  public setComponent<TKey extends ComponentKey<TComponents>>(
    entityId: EntityId,
    key: TKey,
    component: TComponents[TKey],
  ): void {
    this.requireAlive(entityId);
    this.getStore(key).set(entityId, component);
  }

  public getComponent<TKey extends ComponentKey<TComponents>>(
    entityId: EntityId,
    key: TKey,
  ): TComponents[TKey] | undefined {
    return this.getStore(key).get(entityId);
  }

  public hasComponent<TKey extends ComponentKey<TComponents>>(entityId: EntityId, key: TKey): boolean {
    return this.getStore(key).has(entityId);
  }

  public removeComponent<TKey extends ComponentKey<TComponents>>(entityId: EntityId, key: TKey): boolean {
    return this.getStore(key).remove(entityId);
  }

  public query(keys: readonly ComponentKey<TComponents>[], options: QueryOptions = {}): EntityId[] {
    const matches: EntityId[] = [];

    for (const entityId of this.entityCreationOrder) {
      if (!options.includeDestroyed && !this.aliveEntityIds.has(entityId)) {
        continue;
      }

      let hasAllComponents = true;
      for (const key of keys) {
        if (!this.getStore(key).has(entityId)) {
          hasAllComponents = false;
          break;
        }
      }

      if (hasAllComponents) {
        matches.push(entityId);
      }
    }

    return matches;
  }

  private getStore<TKey extends ComponentKey<TComponents>>(key: TKey): ComponentStore<TComponents[TKey]> {
    const existing = this.componentStores.get(key);
    if (existing) {
      return existing as ComponentStore<TComponents[TKey]>;
    }

    const created = new ComponentStore<TComponents[TKey]>();
    this.componentStores.set(key, created);
    return created;
  }

  private requireAlive(entityId: EntityId): void {
    if (!this.aliveEntityIds.has(entityId)) {
      throw new Error(`Entity ${entityId} is not alive.`);
    }
  }
}
