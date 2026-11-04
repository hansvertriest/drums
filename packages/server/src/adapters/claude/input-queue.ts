/** The prompt of a streaming query: stays open between turns, so the session does too. */
export function createInputQueue<T>() {
  const waiting: T[] = [];
  let wake: (() => void) | undefined;
  let closed = false;

  async function* iterate(): AsyncGenerator<T> {
    for (;;) {
      const item = waiting.shift();
      if (item !== undefined) {
        yield item;
        continue;
      }
      if (closed) return;
      await new Promise<void>((resolve) => (wake = resolve));
      wake = undefined;
    }
  }

  return {
    iterable: iterate(),
    push(item: T) {
      waiting.push(item);
      wake?.();
    },
    close() {
      closed = true;
      wake?.();
    },
  };
}
