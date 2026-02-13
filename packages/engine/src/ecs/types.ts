export type EntityId = number;

export type ComponentMap = object;

export type ComponentKey<TComponents extends ComponentMap> = Extract<keyof TComponents, string>;

export interface QueryOptions {
  includeDestroyed?: boolean;
}
