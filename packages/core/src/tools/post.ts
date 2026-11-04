import { z } from 'zod';
import { defineTool, jsonResult } from './tool-definition.js';

export const postTool = defineTool({
  id: 'post',
  description: `Post a note in your thread: the only way to say something the user will read as a message.
Call it for a decision, a finding or a question that has no artifact to go with it, and to answer the user when no new artifact version does.
Do not call it just to announce a new artifact version: artifact_create and artifact_update already put one in the thread.
The message is Markdown; put symbols and files in backticks.`,
  input: z.object({
    title: z.string().min(1).describe('A few words.'),
    message: z.string().describe('Markdown.'),
  }),
  async handle({ title, message }, { workspace, agent, services }) {
    const post = await services.posts.add(workspace, agent, { kind: 'note', title, message });
    return jsonResult({ posted: post.seq });
  },
});
