import { MAX_MESSAGE_BODY_BYTES, SendMessageRequest } from '@drums/protocol';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { RouteGroup } from '../route-group.js';
import { agentParam, parseBody, workspaceParam } from '../validate.js';

export const messageRoutes: RouteGroup = {
  path: '/api/workspaces/:ws/agents/:a/messages',
  create({ services }) {
    const limit = bodyLimit({ maxSize: MAX_MESSAGE_BODY_BYTES, onError: (c) => c.json({ error: 'That message is too large.' }, 413) });
    return new Hono().post('/', limit, async (c) => {
      const { text, focus, images } = await parseBody(c, SendMessageRequest);
      const pasted = images.map(({ type, data }) => ({ type, bytes: Buffer.from(data, 'base64') }));
      await services.agents.send(workspaceParam(c), agentParam(c), text, focus, pasted);
      return c.body(null, 202);
    });
  },
};
