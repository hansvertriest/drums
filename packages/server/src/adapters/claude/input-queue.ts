/** A queue to iterate over: a streaming query's prompt, which stays open between turns, or a session's events. */
export function createInputQueue<T>() {
  const waiting: T[] = [];
  let wake: (() => void) | undefined;
  let closed = false;
  let failure: { error: unknown } | undefined;

  async function* iterate(): AsyncGenerator<T> {
    for (;;) {
      const item = waiting.shift();
      if (item !== undefined) {
        yield item;
        continue;
      }
      if (failure) throw failure.error;
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
    /** Ends the iteration with an error, after what is queued. */
    fail(error: unknown) {
      failure = { error };
      wake?.();
    },
  };
}
