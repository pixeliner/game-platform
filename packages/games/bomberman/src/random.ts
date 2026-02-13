export class DeterministicRandom {
  private state: number;

  public constructor(seed: number) {
    const normalized = seed >>> 0;
    this.state = normalized === 0 ? 0x6d2b79f5 : normalized;
  }

  public nextInt32(): number {
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state;
  }

  public nextFloat(): number {
    return this.nextInt32() / 0xffffffff;
  }
}
