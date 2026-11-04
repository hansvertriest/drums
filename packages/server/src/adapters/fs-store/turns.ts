/** Runs work one at a time per key, in order. A failure doesn't hold up the next in line. */
export function createTurns() {
  const tails = new Map<string, Promise<unknown>>();
  return <T>(key: string, work: () => Promise<T>): Promise<T> => {
    const result = (tails.get(key) ?? Promise.resolve()).then(work, work);
    tails.set(key, result.catch(() => undefined));
    return result;
  };
}
