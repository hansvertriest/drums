export interface Clock {
  now(): Date;
  /** Runs `fn` once, later. Returns how to cancel it. Never keeps the process alive. */
  after(ms: number, fn: () => void): () => void;
}
