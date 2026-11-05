import type { NudgeCounts } from '@drums/protocol';
import { Hono } from 'hono';
import type { RouteGroup } from '../route-group.js';

/** How often each role had to be nudged at the end of a turn, over all workspaces. Frequent nudges mean a prompt needs fixing. */
export const nudgeRoutes: RouteGroup = {
  path: '/api/nudges',
  create({ services }) {
    return new Hono().get('/', async (c) => c.json((await services.agents.nudges()) satisfies NudgeCounts));
  },
};
