import type { VersionResponse } from '@drums/protocol';
import { Hono } from 'hono';
import type { RouteGroup } from '../route-group.js';
import { artifactParam, versionParam, workspaceParam } from '../validate.js';

export const artifactRoutes: RouteGroup = {
  path: '/api/workspaces/:ws/artifacts/:id',
  create({ services }) {
    return new Hono().get('/versions/:v', async (c) => {
      const workspace = workspaceParam(c);
      const id = artifactParam(c);
      const { content, ...version } = await services.artifacts.read(workspace, id, versionParam(c));
      const answers = await services.feedback.answersFor(workspace, id, version.version);
      return c.json({ version, content, answers } satisfies VersionResponse);
    });
  },
};

