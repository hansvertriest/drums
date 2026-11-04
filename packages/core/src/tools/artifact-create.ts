import { z } from 'zod';
import { defineTool, jsonResult } from './tool-definition.js';

export const artifactCreateTool = defineTool({
  id: 'artifact_create',
  description: `Create a new artifact: a living HTML document the user reads and answers in, shown next to your thread.
Call it when you have something for the user to look at or decide on, and no existing artifact is the right place for it; otherwise use artifact_update. It posts version 1 in your thread for you.
Follow the artifact contract in your instructions: an HTML fragment, named controls for what you want answered.`,
  input: z.object({
    title: z.string().min(1).describe('Short, e.g. "Scope: Checkout v2".'),
    html: z.string().min(1).describe('An HTML fragment.'),
    note: z.string().min(1).describe('One line: what this version is.'),
  }),
  async handle({ title, html, note }, { workspace, agent, defaultArtifactKind, services }) {
    const created = await services.artifacts.create(workspace, agent, {
      title,
      content: html,
      note,
      ...(defaultArtifactKind ? { kind: defaultArtifactKind } : {}),
    });
    return jsonResult(created);
  },
});
