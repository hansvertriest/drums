import { AnswerPermissionRequest } from '@drums/protocol';
import { Hono } from 'hono';
import type { RouteGroup } from '../route-group.js';
import { agentParam, parseBody, workspaceParam } from '../validate.js';

export const permissionRoutes: RouteGroup = {
  path: '/api/workspaces/:ws/agents/:a/permissions',
  create({ services }) {
    return new Hono().post('/:id', async (c) => {
      const { decision } = await parseBody(c, AnswerPermissionRequest);
      await services.agents.answerPermission(workspaceParam(c), agentParam(c), c.req.param('id'), decision);
      return c.body(null, 204);
    });
  },
};
