import type { ProjectList } from '@drums/protocol';
import { Hono } from 'hono';
import type { RouteGroup } from '../route-group.js';

export const projectRoutes: RouteGroup = {
  path: '/api/projects',
  create({ services }) {
    return new Hono().get('/', async (c) => c.json((await services.code.projects()) satisfies ProjectList));
  },
};
