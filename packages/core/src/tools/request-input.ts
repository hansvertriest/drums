import { z } from 'zod';
import { defineTool, jsonResult } from './tool-definition.js';

export const requestInputTool = defineTool({
  id: 'request_input',
  description: `Tell the user you can't go on without them: it marks you as Needs input and shows them the reason.
Call it when you are blocked on a decision or on answers, usually right after posting the artifact that holds the questions, then end your turn. Their answers arrive as your next message. Don't call it when you are simply done; ending your turn marks your work ready for review.`,
  input: z.object({
    reason: z.string().min(1).describe('One line: what you need from the user.'),
  }),
  async handle({ reason }, { workspace, agent, services }) {
    await services.agents.requestInput(workspace, agent, reason);
    return jsonResult({ status: 'input', next: 'End your turn now. The answer arrives as your next message.' });
  },
});
