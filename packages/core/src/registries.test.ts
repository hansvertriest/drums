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

  it('hold the roles, and only the one that needs a repo can change anything', () => {
    const registry = createRoleRegistry();
    expect(registry.list().map((role) => role.id)).toEqual(['scoper', 'researcher', 'designer', 'coder', 'reviewer']);
    const [coders, others] = [registry.list().filter((role) => role.needsRepo), registry.list().filter((role) => !role.needsRepo)];
    expect(coders.map((role) => [role.id, role.access])).toEqual([['coder', 'shell-and-files']]);
    expect(coders[0]!.tools).toEqual(expect.arrayContaining(['checkpoint', 'impact']));
    for (const role of others) {
      expect(role.tools).toEqual(['post', 'artifact_list', 'artifact_read', 'artifact_create', 'artifact_update', 'request_input', 'feed']);
      expect(role.access).toBe('read-files');
      expect(role.prompt).toContain('read and search the code');
      expect(role.prompt).not.toContain('no files');
    }
  });

  it('tell every role how to work beside the others', () => {
    for (const role of createRoleRegistry().list()) {
      expect(role.prompt, role.id).toContain('<drums-focus>');
      expect(role.prompt, role.id).toContain('<drums-workspace>');
      expect(role.prompt, role.id).toContain('request_input');
      expect(role.prompt, role.id).toContain(`You are the ${role.name}`);
    }
  });

  it('give every role a summary for the picker', () => {
    const summaries = createRoleRegistry().list().map((role) => role.summary);
    expect(new Set(summaries).size).toBe(summaries.length);
  });
});
