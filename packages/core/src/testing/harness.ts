import { createTurnCheckRegistry } from '../agents/turn-checks/registry.js';
import { createArtifactKindRegistry } from '../artifacts/registry.js';
import { createEventBus } from '../events/event-bus.js';
import type { Clock } from '../ports/clock.js';
import type { Ids } from '../ports/ids.js';
import type { RolePick, RolePickRequest } from '../ports/role-picker.js';
import { createRoleRegistry } from '../roles/registry.js';
import { createServices } from '../services.js';
import { createToolRegistry } from '../tools/registry.js';
import { createFakeBackend } from './fake-backend.js';
import { createFakeCode } from './fake-code.js';
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
  /** What was put off with `clock.after`. A test calls `timers.fire()` to let the time pass. */
  const timers = {
    pending: new Set<() => void>(),
    fire() {
      const due = [...timers.pending];
      timers.pending.clear();
      for (const run of due) run();
    },
  };
  const clock: Clock = {
    now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)),
    after(_ms, fn) {
      timers.pending.add(fn);
      return () => void timers.pending.delete(fn);
    },
  };
  const ids: Ids = { next: () => `id${++counter}` };
  /** What the role picker answers, and what it was asked. By default what a code workspace needs, and nothing elsewhere. */
  const picker = {
    answer: (request: RolePickRequest): Promise<RolePick[]> =>
      Promise.resolve(request.hasRepos ? [{ role: request.candidates.find((c) => c.id === 'coder')?.id ?? 'coder', instruction: request.goal }] : []),
    asked: [] as RolePickRequest[],
    pick(request: RolePickRequest) {
      picker.asked.push(request);
      return picker.answer(request);
    },
  };
  const code = createFakeCode();
  const services = createServices({
    store,
    backend,
    events,
    clock,
    ids,
    roles: createRoleRegistry(),
    tools: createToolRegistry(),
    artifactKinds: createArtifactKindRegistry(),
    turnChecks: createTurnCheckRegistry(),
    rolePicker: picker,
    git: code.git,
    dependencies: code.dependencies,
    pullRequests: code.pullRequests,
    projects: code.projects,
    codeReview: code.codeReview,
    viewerUrl: (workspace, repo) => `http://drums/map/${workspace}/${repo}/`,
    firstRole: 'scoper',
    sessionGraceMs: 60_000,
  });
  return { store, backend, events, seen, services, picker, code, timers };
}

/** Lets the agent service's event loop catch up with what a test emitted. */
export const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise((resolve) => setImmediate(resolve));
};
