import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { RouteGroup } from './route-group.js';
import { workspaceParam } from './validate.js';

const HEARTBEAT_MS = 15_000;

/** Server-Sent Events: the domain events of one workspace. `core` knows nothing of this. */
export const streamRoutes: RouteGroup = {
  path: '/api/workspaces/:ws/stream',
  create({ events, services }) {
    return new Hono().get('/', async (c) => {
      const workspace = workspaceParam(c);
      await services.workspaces.state(workspace);
      return streamSSE(c, async (stream) => {
        /** An event's JSON, or `null` for a heartbeat. */
        const pending: Array<string | null> = [];
        let wake = () => {};
        const enqueue = (item: string | null) => {
          pending.push(item);
          wake();
        };
        const unsubscribe = events.onAny((event) => {
          if (event.workspace === workspace) enqueue(JSON.stringify(event));
        });
        const heartbeat = setInterval(() => enqueue(null), HEARTBEAT_MS);
        let ended = false;
        stream.onAbort(() => {
          ended = true;
          wake();
        });
        try {
          await stream.writeSSE({ event: 'ready', data: '' });
          while (!ended) {
            const item = pending.shift();
            if (item === undefined) await new Promise<void>((resolve) => (wake = resolve));
            else if (item === null) await stream.writeSSE({ event: 'ping', data: '' });
            else await stream.writeSSE({ data: item });
          }
        } finally {
          clearInterval(heartbeat);
          unsubscribe();
        }
      });
    });
  },
};
