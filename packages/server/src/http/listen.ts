import { serve } from '@hono/node-server';
import type { Hono } from 'hono';

export interface Listening {
  port: number;
  close(): Promise<void>;
}

export function listen(app: Hono, port: number, hostname: string): Promise<Listening> {
  return new Promise((resolve, reject) => {
    const server = serve({ fetch: app.fetch, port, hostname }, (info) => {
      server.off('error', reject);
      resolve({
        port: info.port,
        close: () =>
          new Promise((done, fail) => {
            server.close((error) => (error ? fail(error) : done()));
            // Event streams never finish on their own.
            if ('closeAllConnections' in server) server.closeAllConnections();
          }),
      });
    });
    server.once('error', reject);
  });
}
