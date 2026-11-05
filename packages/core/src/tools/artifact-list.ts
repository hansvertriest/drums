import { z } from 'zod';
import { defineTool, jsonResult } from './tool-definition.js';

export const artifactListTool = defineTool({
  id: 'artifact_list',
  description: `List this workspace's artifacts with their latest version and who posted it.
Call it before creating an artifact, to check that it doesn't exist yet, and whenever you need an artifact's id.
An archived one was put away by the user: leave it be unless they ask for it. A new version brings it back.`,
  input: z.object({}),
  async handle(_input, { workspace, services }) {
    const [artifacts, nameOf] = await Promise.all([services.artifacts.list(workspace), services.agents.namer(workspace)]);
    return jsonResult(
      artifacts.map(({ id, title, kind, versions, archived }) => {
        const latest = versions.at(-1);
        return { id, title, kind, latest: latest?.version, by: latest && nameOf(latest.by), ...(archived ? { archived } : {}) };
      }),
    );
  },
});
