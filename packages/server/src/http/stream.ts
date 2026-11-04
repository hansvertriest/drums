import { WORKSPACES_CHANGED, type DomainEvent } from '@drums/protocol';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { RouteGroup } from './route-group.js';
import { workspaceParam } from './validate.js';

const HEARTBEAT_MS = 15_000;

/** What changes a workspace's line in the strip: its status, and the role that posted last. */
const SUMMARY_EVENTS: ReadonlyArray<DomainEvent['type']> = ['agent.added', 'agent.status', 'post.created'];

/**
 * Server-Sent Events: the domain events of one workspace, as plain messages. A second kind of
 * message says that any workspace's summary changed, so the strip stays live on this one
 * connection without other workspaces' content on it. `core` knows nothing of this.
 */
export const streamRoutes: RouteGroup = {
  path: '/api/workspaces/:ws/stream',
  create({ events, services }) {
    return new Hono().get('/', async (c) => {
      const workspace = workspaceParam(c);
      await services.workspaces.state(workspace);
      return streamSSE(c, async (stream) => {
        const pending: Array<{ event?: string; data: string }> = [];
        let wake = () => {};
        const enqueue = (message: { event?: string; data: string }) => {
          pending.push(message);
          wake();
        };
        const unsubscribe = events.onAny((event) => {
          if (event.workspace === workspace) enqueue({ data: JSON.stringify(event) });
          if (SUMMARY_EVENTS.includes(event.type)) enqueue({ event: WORKSPACES_CHANGED, data: '' });
        });
        const heartbeat = setInterval(() => enqueue({ event: 'ping', data: '' }), HEARTBEAT_MS);
        let ended = false;
        stream.onAbort(() => {
          ended = true;
          wake();
        });
        try {
          await stream.writeSSE({ event: 'ready', data: '' });
          while (!ended) {
            const message = pending.shift();
            if (message) await stream.writeSSE(message);
            else await new Promise<void>((resolve) => (wake = resolve));
          }
        } finally {
          clearInterval(heartbeat);
          unsubscribe();
        }
      });
    });
  },
};
