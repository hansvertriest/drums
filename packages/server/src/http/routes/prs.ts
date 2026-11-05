import { OpenPrsRequest, type OpenPrsResponse, type PrDrafts } from '@drums/protocol';
import { Hono } from 'hono';
import type { RouteGroup } from '../route-group.js';
import { parseBody, workspaceParam } from '../validate.js';

export const prRoutes: RouteGroup = {
  path: '/api/workspaces/:ws/prs',
  create({ services }) {
    return new Hono()
      .get('/', async (c) => c.json((await services.prs.drafts(workspaceParam(c))) satisfies PrDrafts))
      .post('/', async (c) => {
        const request = await parseBody(c, OpenPrsRequest);
        return c.json((await services.prs.open(workspaceParam(c), request)) satisfies OpenPrsResponse, 201);
      });
  },
};
