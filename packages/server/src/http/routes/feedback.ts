import { SendFeedbackRequest } from '@drums/protocol';
import { Hono } from 'hono';
import type { RouteGroup } from '../route-group.js';
import { parseBody, workspaceParam } from '../validate.js';

export const feedbackRoutes: RouteGroup = {
  path: '/api/workspaces/:ws/send',
  create({ services }) {
    return new Hono().post('/', async (c) => {
      const { overall } = await parseBody(c, SendFeedbackRequest);
      return c.json(await services.feedback.send(workspaceParam(c), overall));
    });
  },
};
