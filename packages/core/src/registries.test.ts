import { describe, expect, it } from 'vitest';
import { createArtifactKindRegistry, createRoleRegistry, createToolRegistry } from './index.js';

describe('built-in registries', () => {
  it('each hold the dummy entry', () => {
    expect(createRoleRegistry().has('dummy')).toBe(true);
    expect(createToolRegistry().has('dummy')).toBe(true);
    expect(createArtifactKindRegistry().has('dummy')).toBe(true);
  });

  it('only give roles tools and kinds that exist', () => {
    const tools = createToolRegistry();
    const kinds = createArtifactKindRegistry();
    for (const role of createRoleRegistry().list()) {
      for (const tool of role.tools) expect(tools.has(tool)).toBe(true);
      if (role.defaultArtifactKind) expect(kinds.has(role.defaultArtifactKind)).toBe(true);
    }
  });

  it('run a tool through its schema', async () => {
    const tool = createToolRegistry().get('dummy');
    const input = tool.input.parse({ text: 'hi' });
    await expect(tool.handle(input, { workspace: 'w1', agent: 'a1' })).resolves.toEqual({ text: 'hi' });
    expect(tool.input.safeParse({}).success).toBe(false);
  });
});
