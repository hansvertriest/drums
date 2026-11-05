import { z } from 'zod';
import { defineTool, jsonResult } from './tool-definition.js';

export const checkpointTool = defineTool({
  id: 'checkpoint',
  description: `Post a checkpoint of the branch so the user can review it on the map.
Call it after each coherent step (a feature step, a fix, a refactor) once the
tests you ran pass, and always before you end your turn if you changed files
since your last checkpoint. The message says what changed, why, and what to look at;
put symbols and files in backticks.`,
  input: z.object({
    title: z.string().min(1).describe('A few words.'),
    message: z.string().min(1).describe('Markdown: what changed, why, and what to look at.'),
  }),
  async handle({ title, message }, { workspace, agent, services }) {
    return jsonResult(await services.code.checkpoint(workspace, agent, { title, message }));
  },
});
