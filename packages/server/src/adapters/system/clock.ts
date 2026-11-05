import type { Clock } from '@drums/core';

export function createSystemClock(): Clock {
  return {
    now: () => new Date(),
    after(ms, fn) {
      const timer = setTimeout(fn, ms);
      timer.unref();
      return () => clearTimeout(timer);
    },
  };
}
