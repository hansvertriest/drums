import { z } from 'zod';
import { defineTool, jsonResult } from './tool-definition.js';

export const artifactReadTool = defineTool({
  id: 'artifact_read',
  description: `Read an artifact's HTML, its author and its change note.
Call it before updating an artifact whose latest version you don't have in front of you, for example after a conflict or when someone else posted last. Leave out version to read the latest.`,
  input: z.object({
    id: z.string().min(1),
    version: z.number().int().positive().optional(),
  }),
  async handle({ id, version }, { workspace, services }) {
    const read = await services.artifacts.read(workspace, id, version);
    return jsonResult({ html: read.content, version: read.version, by: read.by, note: read.note });
  },
});
