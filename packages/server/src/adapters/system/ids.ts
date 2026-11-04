import { randomUUID } from 'node:crypto';
import type { Ids } from '@drums/core';

export function createUuidIds(): Ids {
  return { next: () => randomUUID() };
}
