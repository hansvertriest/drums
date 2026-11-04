import { SendMessageRequest } from '@drums/protocol';
import { Hono } from 'hono';
import type { RouteGroup } from '../route-group.js';
import { agentParam, parseBody, workspaceParam } from '../validate.js';

export const messageRoutes: RouteGroup = {
  path: '/api/workspaces/:ws/agents/:a/messages',
  create({ services }) {
    return new Hono().post('/', async (c) => {
      const { text, focus } = await parseBody(c, SendMessageRequest);
      await services.agents.send(workspaceParam(c), agentParam(c), text, focus);
      return c.body(null, 202);
    });
  },
};
