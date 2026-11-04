import { z } from 'zod';
import { defineTool } from './tool-definition.js';

/** Placeholder until the real tools arrive in M1. */
export const dummyTool = defineTool({
  id: 'dummy',
  description: 'Echoes its input. Never call it; it only proves the tool registry works.',
  input: z.object({ text: z.string() }),
  handle: async ({ text }) => ({ text }),
});
