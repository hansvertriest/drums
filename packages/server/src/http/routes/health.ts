import type { HealthResponse } from '@drums/protocol';
import { Hono } from 'hono';
import type { RouteGroup } from '../route-group.js';

/** The dummy route group: shows the registries reached the HTTP layer. */
export const healthRoutes: RouteGroup = {
  path: '/api/health',
  create({ clock, roles, tools, artifactKinds }) {
    return new Hono().get('/', (c) => {
      const body: HealthResponse = {
        status: 'ok',
        time: clock.now().toISOString(),
        roles: roles.list().map((role) => role.id),
        tools: tools.list().map((tool) => tool.id),
        artifactKinds: artifactKinds.list().map((kind) => kind.id),
      };
      return c.json(body);
    });
  },
};
