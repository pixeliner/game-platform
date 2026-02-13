import type { GameEventEnvelope } from '@game-platform/engine';

import type { BombermanEvent } from './types.js';
import type { BombermanSimulationState } from './state/setup-world.js';

export function pushBombermanEvent(state: BombermanSimulationState, event: BombermanEvent): void {
  const envelope: GameEventEnvelope<BombermanEvent> = {
    eventId: state.nextEventId,
    tick: state.tick,
    event,
  };

  state.nextEventId += 1;
  state.events.push(envelope);
}

export function getBombermanEventsSince(
  state: BombermanSimulationState,
  lastEventId: number,
): Array<GameEventEnvelope<BombermanEvent>> {
  return state.events.filter((envelope) => envelope.eventId > lastEventId);
}
