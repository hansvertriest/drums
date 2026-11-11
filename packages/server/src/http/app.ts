import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { onError } from './errors.js';
import { browserOrigin, isOurHost, sameOriginOnly } from './guard.js';
import type { HttpDeps, RouteGroup } from './route-group.js';
import { agentRoutes } from './routes/agents.js';
import { answerRoutes } from './routes/answers.js';
import { artifactRoutes } from './routes/artifacts.js';
import { feedbackRoutes } from './routes/feedback.js';
import { healthRoutes } from './routes/health.js';
import { imageRoutes } from './routes/images.js';
import { mapRoutes } from './routes/map.js';
import { mapViewerRoutes } from './routes/map-viewer.js';
import { messageRoutes } from './routes/messages.js';
import { nudgeRoutes } from './routes/nudges.js';
import { permissionRoutes } from './routes/permissions.js';
import { projectRoutes } from './routes/projects.js';
import { workspaceRoutes } from './routes/workspaces.js';
import { streamRoutes } from './stream.js';

/** Add a route group: one new file in `routes/`, one line here. */
const routeGroups: readonly RouteGroup[] = [
  healthRoutes,
  workspaceRoutes,
  streamRoutes,
  agentRoutes,
  messageRoutes,
  imageRoutes,
  artifactRoutes,
  answerRoutes,
  feedbackRoutes,
  permissionRoutes,
  projectRoutes,
  mapRoutes,
  mapViewerRoutes,
  nudgeRoutes,
];

export interface AppOptions {
  /** Absolute path of the built web app. */
  webRoot: string;
  /** The interface the server is bound to. */
  host: string;
  /** Extra hostnames this server answers to, for a proxy in front of it. */
  allowedHosts: readonly string[];
}

/**
 * The CSP an artifact can't set for itself: a sandboxed iframe may still navigate itself,
 * and only the page embedding it can forbid that. `srcdoc` frames aren't affected, and they
 * inherit this, so it must stay limited to frames. Only the map's frames may load, and without
 * its secret path an artifact gets nothing there.
 */
const appCsp = (host: string | undefined, forwardedProto: string | undefined, boundHost: string, allowedHosts: readonly string[]) =>
  `frame-src ${isOurHost(host, boundHost, allowedHosts) ? `${browserOrigin(host, forwardedProto, allowedHosts)}/map/` : "'none'"}`;

export function createApp(deps: HttpDeps, { webRoot, host, allowedHosts }: AppOptions): Hono {
  const app = new Hono();
  app.onError(onError);
  app.use('/api/*', sameOriginOnly(host, allowedHosts));
  for (const group of routeGroups) {
    const routes = group.create(deps);
    routes.onError(onError);
    app.route(group.path, routes);
  }
  app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404));
  app.use('*', async (c, next) => {
    await next();
    c.header('Content-Security-Policy', appCsp(c.req.header('host'), c.req.header('x-forwarded-proto'), host, allowedHosts));
  });
  app.use('*', serveStatic({ root: webRoot }));
  app.get('*', serveStatic({ root: webRoot, path: 'index.html' }));
  return app;
}
