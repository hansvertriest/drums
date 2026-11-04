import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import type { HttpDeps, RouteGroup } from './route-group.js';
import { healthRoutes } from './routes/health.js';

/** Add a route group: one new file in `routes/`, one line here. */
const routeGroups: readonly RouteGroup[] = [healthRoutes];

export interface AppOptions {
  /** Absolute path of the built web app. */
  webRoot: string;
}

export function createApp(deps: HttpDeps, { webRoot }: AppOptions): Hono {
  const app = new Hono();
  for (const group of routeGroups) app.route(group.path, group.create(deps));
  app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404));
  app.use('*', serveStatic({ root: webRoot }));
  app.get('*', serveStatic({ root: webRoot, path: 'index.html' }));
  return app;
}
