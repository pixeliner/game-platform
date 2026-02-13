import { describe, expect, it } from 'vitest';

import { EcsWorld } from '../ecs/world.js';

interface TestComponents {
  position: {
    x: number;
    y: number;
  };
  health: {
    hp: number;
  };
}

describe('EcsWorld', () => {
  it('assigns deterministic monotonically increasing entity ids', () => {
    const world = new EcsWorld<TestComponents>();

    const e1 = world.createEntity();
    const e2 = world.createEntity();
    const e3 = world.createEntity();

    expect([e1, e2, e3]).toEqual([1, 2, 3]);
  });

  it('keeps query ordering stable across add/remove/destroy operations', () => {
    const world = new EcsWorld<TestComponents>();
    const e1 = world.createEntity();
    const e2 = world.createEntity();
    const e3 = world.createEntity();

    world.addComponent(e2, 'position', { x: 2, y: 0 });
    world.addComponent(e1, 'position', { x: 1, y: 0 });
    world.addComponent(e3, 'position', { x: 3, y: 0 });

    expect(world.query(['position'])).toEqual([e1, e2, e3]);

    world.destroyEntity(e2);
    expect(world.query(['position'])).toEqual([e1, e3]);

    world.removeComponent(e1, 'position');
    expect(world.query(['position'])).toEqual([e3]);

    world.addComponent(e1, 'position', { x: 10, y: 10 });
    expect(world.query(['position'])).toEqual([e1, e3]);
  });

  it('isolates component stores by key and supports add/get/set/remove', () => {
    const world = new EcsWorld<TestComponents>();
    const entityId = world.createEntity();

    world.addComponent(entityId, 'position', { x: 4, y: 8 });
    expect(world.getComponent(entityId, 'position')).toEqual({ x: 4, y: 8 });
    expect(world.getComponent(entityId, 'health')).toBeUndefined();

    world.setComponent(entityId, 'position', { x: 5, y: 9 });
    world.setComponent(entityId, 'health', { hp: 3 });

    expect(world.hasComponent(entityId, 'position')).toBe(true);
    expect(world.hasComponent(entityId, 'health')).toBe(true);
    expect(world.getComponent(entityId, 'position')).toEqual({ x: 5, y: 9 });
    expect(world.getComponent(entityId, 'health')).toEqual({ hp: 3 });

    expect(world.removeComponent(entityId, 'position')).toBe(true);
    expect(world.getComponent(entityId, 'position')).toBeUndefined();
    expect(world.getComponent(entityId, 'health')).toEqual({ hp: 3 });
  });
});
