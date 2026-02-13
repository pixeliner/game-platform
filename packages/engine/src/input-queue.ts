export interface QueuedInput {
  sequence: number;
  playerId: string;
  tick: number;
  input: unknown;
}

export class InputQueue {
  private readonly queuedInputs: QueuedInput[] = [];
  private nextSequence = 1;

  public enqueue(playerId: string, tick: number, input: unknown): QueuedInput {
    const queuedInput: QueuedInput = {
      sequence: this.nextSequence,
      playerId,
      tick,
      input,
    };

    this.nextSequence += 1;
    this.queuedInputs.push(queuedInput);

    return queuedInput;
  }

  public drainReady(maxTick: number): QueuedInput[] {
    const ready: QueuedInput[] = [];
    const pending: QueuedInput[] = [];

    for (const queuedInput of this.queuedInputs) {
      if (queuedInput.tick <= maxTick) {
        ready.push(queuedInput);
        continue;
      }

      pending.push(queuedInput);
    }

    this.queuedInputs.length = 0;
    this.queuedInputs.push(...pending);

    ready.sort((a, b) => a.sequence - b.sequence);
    return ready;
  }

  public clear(): void {
    this.queuedInputs.length = 0;
  }

  public size(): number {
    return this.queuedInputs.length;
  }
}
