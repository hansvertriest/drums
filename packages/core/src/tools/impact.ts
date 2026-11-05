import { z } from 'zod';
import { defineTool } from './tool-definition.js';

export const impactTool = defineTool({
  id: 'impact',
  description: `Ask what a symbol or file is connected to and what the branch did to it: callers, routes, tests, breakage.
Call it before you change a symbol other code may depend on, to see who you could break. Call it with no target after each step, before checkpoint: it summarizes the whole branch, so you see broken references, signature changes with callers you didn't touch, new cycles and untested changes while you can still fix them.
The target is a Class.method, Class or function name, a node id, or a file path relative to its repo.`,
  input: z.object({
    target: z.string().min(1).optional().describe('Leave out for a summary of the branch.'),
  }),
  async handle({ target }, { workspace, services }) {
    const result = await services.code.impact(workspace, target);
    return { text: result.text, ...(result.found ? {} : { isError: true }) };
  },
});
