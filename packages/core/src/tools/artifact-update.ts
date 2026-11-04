import { z } from 'zod';
import { defineTool, jsonResult } from './tool-definition.js';

export const artifactUpdateTool = defineTool({
  id: 'artifact_update',
  description: `Post a new version of an artifact.
Call it whenever an artifact should change, above all after feedback: the user's answers should end up in the next version, as decisions rather than open questions. It posts the version in your thread for you.
Send the complete HTML, mark sections that changed with class="chg", and pass the version you started from as base_version. If a newer version exists you are refused and get the latest back: merge your change into it and call this again with its version.`,
  input: z.object({
    id: z.string().min(1),
    base_version: z.number().int().positive().describe('The version your HTML is based on.'),
    html: z.string().min(1).describe('The complete new HTML fragment.'),
    note: z.string().min(1).describe('One line: what changed.'),
  }),
  async handle({ id, base_version, html, note }, { workspace, agent, services }) {
    const result = await services.artifacts.update(workspace, agent, { id, baseVersion: base_version, content: html, note });
    if (result.status === 'ok') return jsonResult({ version: result.version });
    const { content, ...latest } = result.latest;
    return jsonResult({ conflict: `Version ${latest.version} is newer than your base.`, latest: { ...latest, html: content } }, true);
  },
});
