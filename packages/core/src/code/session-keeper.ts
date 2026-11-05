import type { WorkspaceId } from '@drums/protocol';
import type { EventBus } from '../events/event-bus.js';
import type { Clock } from '../ports/clock.js';
import type { Store } from '../ports/store.js';
import type { CodeSessions } from './code-sessions.js';

export interface KeptSessions extends CodeSessions {
  /** Someone has this workspace open. Keeps its sessions until the function it returns is called. */
  view(workspace: WorkspaceId): () => void;
  close(): Promise<void>;
}

export interface SessionKeeperDeps {
  store: Store;
  events: EventBus;
  clock: Clock;
  graceMs: number;
}

/**
 * Pausing (spec §7): only workspaces that are open or have a running agent keep sessions. The rest
 * stop, a grace period after the last reason to keep them, and resume on demand through `session`.
 */
export function createSessionKeeper(inner: CodeSessions, { store, events, clock, graceMs }: SessionKeeperDeps): KeptSessions {
  const viewers = new Map<WorkspaceId, number>();
  const timers = new Map<WorkspaceId, () => void>();

  const cancel = (workspace: WorkspaceId) => {
    timers.get(workspace)?.();
    timers.delete(workspace);
  };

  /** A turn waiting on a permission is still running, whatever its status says. */
  const hasRunningAgent = async (workspace: WorkspaceId) => {
    const found = await store.getWorkspace(workspace);
    return !!found && (found.agents.some((agent) => agent.status === 'running') || found.permissions.some((request) => request.status === 'pending'));
  };

  const pauseIfUnused = async (workspace: WorkspaceId) => {
    timers.delete(workspace);
    // A running agent's status event starts this again when it ends.
    if (await hasRunningAgent(workspace)) return;
    if (!viewers.has(workspace) && !timers.has(workspace)) await inner.stop(workspace);
  };

  let closed = false;

  const schedule = (workspace: WorkspaceId) => {
    cancel(workspace);
    if (closed || viewers.has(workspace)) return;
    // Nothing waits for this. Failing to stop has already taken the session out of the running ones.
    timers.set(workspace, clock.after(graceMs, () => void pauseIfUnused(workspace).catch(() => undefined)));
  };

  const unsubscribe = events.on('agent.status', ({ workspace, status }) => {
    if (status !== 'running' && inner.has(workspace)) schedule(workspace);
  });

  return {
    ...inner,
    session(workspace, repo) {
      // Using a session is a reason to keep it, however it came to be asked for. The time counts from when
      // it is ready: building a first index can take longer than the grace period.
      cancel(workspace);
      const opening = inner.session(workspace, repo);
      const done = () => schedule(workspace);
      opening.then(done, done);
      return opening;
    },
    view(workspace) {
      cancel(workspace);
      viewers.set(workspace, (viewers.get(workspace) ?? 0) + 1);
      let left = false;
      return () => {
        if (left) return;
        left = true;
        const remaining = (viewers.get(workspace) ?? 1) - 1;
        if (remaining > 0) return void viewers.set(workspace, remaining);
        viewers.delete(workspace);
        if (inner.has(workspace)) schedule(workspace);
      };
    },
    async close() {
      closed = true;
      unsubscribe();
      for (const workspace of [...timers.keys()]) cancel(workspace);
      await inner.stopAll();
    },
  };
}
