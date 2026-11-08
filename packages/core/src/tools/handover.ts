import { z } from 'zod';
import { defineTool, jsonResult } from './tool-definition.js';

export const handoverTool = defineTool({
  id: 'handover',
  description: `Hand your work to another role, so it carries on without waiting for the user. The roles are in your <drums-workspace> block.
Call it when your part is done and you know which role should go next, at most once per turn, then end your turn. It only happens once your turn ends cleanly: stopping, failing or calling request_input cancels it. It goes to that role's open agent, or a new one if it has none. Don't call it when the user should decide or look first; use request_input for that, or just end your turn.
The instruction is all the receiver gets from you, so say what to do and which artifacts or files to read.`,
  input: z.object({
    role: z.string().min(1).describe('The id of the role that should carry on, such as "reviewer".'),
    instruction: z.string().min(1).describe('What that agent should do. Markdown.'),
  }),
  async handle({ role, instruction }, { workspace, agent, services }) {
    await services.agents.handover(workspace, agent, { role, instruction });
    return jsonResult({ status: 'recorded', next: 'End your turn now. The handover happens when it ends.' });
  },
});
