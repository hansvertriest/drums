import type { Clock } from '@drums/core';

export function createSystemClock(): Clock {
  return { now: () => new Date() };
}
