import { z } from 'zod';
import { defineTool, jsonResult } from './tool-definition.js';

export const artifactListTool = defineTool({
  id: 'artifact_list',
  description: `List this workspace's artifacts with their latest version and who posted it.
Call it before creating an artifact, to check that it doesn't exist yet, and whenever you need an artifact's id.`,
  input: z.object({}),
  async handle(_input, { workspace, services }) {
    const artifacts = await services.artifacts.list(workspace);
    return jsonResult(
      artifacts.map(({ id, title, kind, versions }) => ({
        id,
        title,
        kind,
        latest: versions.at(-1)?.version,
        by: versions.at(-1)?.by,
      })),
    );
  },
});
