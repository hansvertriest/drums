import { InvalidError } from '@drums/core';
import { ImageName, imageTypeOf } from '@drums/protocol';
import { Hono } from 'hono';
import type { RouteGroup } from '../route-group.js';
import { workspaceParam } from '../validate.js';

export const imageRoutes: RouteGroup = {
  path: '/api/workspaces/:ws/images',
  create({ services }) {
    return new Hono().get('/:name', async (c) => {
      const name = ImageName.safeParse(c.req.param('name'));
      if (!name.success) throw new InvalidError('Invalid image.');
      const bytes = await services.posts.image(workspaceParam(c), name.data);
      return c.body(new Uint8Array(bytes), 200, {
        'content-type': imageTypeOf(name.data)!,
        'cache-control': 'private, max-age=31536000, immutable',
        'x-content-type-options': 'nosniff',
      });
    });
  },
};
