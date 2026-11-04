import { CreateWorkspaceRequest, type WorkspaceList, type WorkspaceState } from '@drums/protocol';
import { Hono } from 'hono';
import type { RouteGroup } from '../route-group.js';
import { parseBody, workspaceParam } from '../validate.js';

export const workspaceRoutes: RouteGroup = {
  path: '/api/workspaces',
  create({ services }) {
    return new Hono()
      .get('/', async (c) => c.json((await services.workspaces.list()) satisfies WorkspaceList))
      .post('/', async (c) => {
        const { goal } = await parseBody(c, CreateWorkspaceRequest);
        return c.json((await services.workspaces.create(goal)) satisfies WorkspaceState, 201);
      })
      .get('/:ws', async (c) => c.json((await services.workspaces.state(workspaceParam(c))) satisfies WorkspaceState));
  },
};
