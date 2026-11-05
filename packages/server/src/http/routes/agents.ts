import { AddAgentRequest, type Agent } from '@drums/protocol';
import { Hono } from 'hono';
import type { RouteGroup } from '../route-group.js';
import { agentParam, parseBody, workspaceParam } from '../validate.js';

export const agentRoutes: RouteGroup = {
  path: '/api/workspaces/:ws/agents',
  create({ services }) {
    return new Hono()
      .post('/', async (c) => {
        const { instruction } = await parseBody(c, AddAgentRequest);
        const agent = await services.agents.add(workspaceParam(c), instruction);
        return c.json(agent satisfies Agent, 201);
      })
      .post('/:a/stop', async (c) => {
        await services.agents.stop(workspaceParam(c), agentParam(c));
        return c.body(null, 204);
      })
      .post('/:a/close', async (c) => {
        await services.agents.close(workspaceParam(c), agentParam(c));
        return c.body(null, 204);
      });
  },
};
