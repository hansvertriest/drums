import { SendMessageRequest } from '@drums/protocol';
import { Hono } from 'hono';
import type { RouteGroup } from '../route-group.js';
import { agentParam, parseBody, workspaceParam } from '../validate.js';

export const messageRoutes: RouteGroup = {
  path: '/api/workspaces/:ws/agents/:a/messages',
  create({ services }) {
    return new Hono().post('/', async (c) => {
      const { text, focus, images } = await parseBody(c, SendMessageRequest);
      const pasted = images.map(({ type, data }) => ({ type, bytes: Buffer.from(data, 'base64') }));
      await services.agents.send(workspaceParam(c), agentParam(c), text, focus, pasted);
      return c.body(null, 202);
    });
  },
};
