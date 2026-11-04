import { createArtifactKindRegistry } from '../artifacts/registry.js';
import { createEventBus } from '../events/event-bus.js';
import type { Clock } from '../ports/clock.js';
import type { Ids } from '../ports/ids.js';
import { createRoleRegistry } from '../roles/registry.js';
import { createServices } from '../services.js';
import { createToolRegistry } from '../tools/registry.js';
import { createFakeBackend } from './fake-backend.js';
import { createMemoryStore } from './memory-store.js';

/** All of core against in-memory fakes, with the real registries. */
export function createHarness() {
  const store = createMemoryStore();
  const backend = createFakeBackend();
  const events = createEventBus();
  const seen: Array<Parameters<Parameters<typeof events.onAny>[0]>[0]> = [];
  events.onAny((event) => seen.push(event));
  let tick = 0;
  let counter = 0;
  const clock: Clock = { now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)) };
  const ids: Ids = { next: () => `id${++counter}` };
  const services = createServices({
    store,
    backend,
    events,
    clock,
    ids,
    roles: createRoleRegistry(),
    tools: createToolRegistry(),
    artifactKinds: createArtifactKindRegistry(),
    firstRole: 'scoper',
  });
  return { store, backend, events, seen, services };
}

/** Lets the agent service's event loop catch up with what a test emitted. */
export const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise((resolve) => setImmediate(resolve));
};
