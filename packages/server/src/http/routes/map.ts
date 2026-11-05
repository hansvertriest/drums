import type { MapState } from '@drums/protocol';
import { Hono } from 'hono';
import type { RouteGroup } from '../route-group.js';
import { workspaceParam } from '../validate.js';

/** The page's view of the map: which frames, and the counts around them. */
export const mapRoutes: RouteGroup = {
  path: '/api/workspaces/:ws/map',
  create({ services, mapToken }) {
    return new Hono().get('/', async (c) => {
      const workspace = workspaceParam(c);
      const [state, commentsTo] = await Promise.all([services.code.mapState(workspace), services.feedback.codeRecipient(workspace)]);
      const repos = state.repos.map((repo) => (repo.error ? repo : { ...repo, viewer: `/map/${mapToken}/${workspace}/${repo.name}/` }));
      return c.json({ ...state, repos, ...(commentsTo ? { commentsTo } : {}) } satisfies MapState);
    });
  },
};
