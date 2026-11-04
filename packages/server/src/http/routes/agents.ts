import { Hono } from 'hono';
import type { RouteGroup } from '../route-group.js';
import { agentParam, workspaceParam } from '../validate.js';

/** Adding an agent joins with M2. */
export const agentRoutes: RouteGroup = {
  path: '/api/workspaces/:ws/agents/:a',
  create({ services }) {
    return new Hono().post('/stop', async (c) => {
      await services.agents.stop(workspaceParam(c), agentParam(c));
      return c.body(null, 204);
    });
  },
};
