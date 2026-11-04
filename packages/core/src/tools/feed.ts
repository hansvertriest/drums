import { z } from 'zod';
import { defineTool, jsonResult } from './tool-definition.js';

export const feedTool = defineTool({
  id: 'feed',
  description: `Read what the other agents in this workspace posted: their notes and new artifact versions.
Call it when you start work that may overlap with theirs, before you end a long turn, and after a conflict on artifact_update, to see what changed around you. Pass the cursor from your last call as since, to get only what is new. Leave out since to get the most recent posts.
Don't call it in a loop to wait for someone: end your turn instead.`,
  input: z.object({
    since: z.number().int().nonnegative().optional().describe('The cursor from your last call: only posts after it.'),
  }),
  async handle({ since }, { workspace, agent, services }) {
    return jsonResult(await services.posts.feed(workspace, agent, since));
  },
});
