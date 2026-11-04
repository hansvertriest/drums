import type { BoundTool } from '@drums/core';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { toMcpTools } from './sdk-tools.js';

const tool = (result: { text: string; isError?: boolean }): BoundTool => ({
  id: 'post',
  description: 'Call it.',
  input: z.object({ title: z.string() }),
  call: async () => result,
});

describe('toMcpTools', () => {
  it('keeps the name, description and input shape', () => {
    const [mcp] = toMcpTools([tool({ text: 'x' })]);
    expect(mcp).toMatchObject({ name: 'post', description: 'Call it.' });
    expect(Object.keys(mcp!.shape)).toEqual(['title']);
  });

  it('answers with content blocks, and passes errors on', async () => {
    const [ok] = toMcpTools([tool({ text: 'fine' })]);
    expect(await ok!.handler({})).toEqual({ content: [{ type: 'text', text: 'fine' }] });
    const [bad] = toMcpTools([tool({ text: 'no', isError: true })]);
    expect(await bad!.handler({})).toEqual({ content: [{ type: 'text', text: 'no' }], isError: true });
  });
});
