import { describe, expect, it } from 'vitest';
import { createArtifactKindRegistry, createRoleRegistry, createToolRegistry } from './index.js';

describe('built-in registries', () => {
  it('only give roles tools and kinds that exist', () => {
    const tools = createToolRegistry();
    const kinds = createArtifactKindRegistry();
    for (const role of createRoleRegistry().list()) {
      for (const tool of role.tools) expect(tools.has(tool)).toBe(true);
      if (role.defaultArtifactKind) expect(kinds.has(role.defaultArtifactKind)).toBe(true);
    }
  });

  it('carry the artifact contract in every role prompt', () => {
    for (const role of createRoleRegistry().list()) {
      expect(role.prompt).toContain('# The artifact contract');
      expect(role.prompt).toContain('class="chg"');
      expect(role.prompt).toContain('base_version');
    }
  });

  it('say when to use each tool', () => {
    for (const tool of createToolRegistry().list()) {
      expect(tool.description, tool.id).toMatch(/\b(Call it|Call)\b/);
    }
  });

  it('hold the M1 tools for the Scoper', () => {
    expect(createRoleRegistry().get('scoper').tools).toEqual([
      'post',
      'artifact_list',
      'artifact_read',
      'artifact_create',
      'artifact_update',
      'request_input',
    ]);
  });
});
