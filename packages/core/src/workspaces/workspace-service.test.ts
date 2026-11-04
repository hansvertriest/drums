import type { Agent } from '@drums/protocol';
import { describe, expect, it } from 'vitest';
import { createHarness } from '../testing/harness.js';
import { workspaceSlug } from './slug.js';
import { workspaceStatus } from './status.js';

const agent = (status: Agent['status']): Agent => ({ id: status, role: 'scoper', name: 'Scoper', status });

describe('workspaceStatus', () => {
  it('shows the state that most needs you', () => {
    expect(workspaceStatus([agent('idle'), agent('running'), agent('input')])).toBe('input');
    expect(workspaceStatus([agent('running'), agent('review')])).toBe('review');
    expect(workspaceStatus([agent('idle'), agent('running')])).toBe('running');
    expect(workspaceStatus([])).toBe('idle');
  });
});

describe('workspaceSlug', () => {
  it('makes a path-safe, readable slug', () => {
    expect(workspaceSlug('Scope ../../etc/passwd, please!', 'AB-12-cd-ef')).toBe('scope-etc-passwd-please-ab12cd');
    expect(workspaceSlug('日本語', 'ab12cd')).toBe('ab12cd');
  });
});

describe('WorkspaceService', () => {
  it('creates a workspace with one running Scoper and shows the goal in its thread', async () => {
    const { services } = createHarness();
    const { workspace, posts } = await services.workspaces.create('Scope checkout');
    expect(workspace.goal).toBe('Scope checkout');
    expect(workspace.agents.map((a) => [a.role, a.status])).toEqual([['scoper', 'running']]);
    expect(posts).toMatchObject([{ kind: 'message', text: 'Scope checkout' }]);
  });

  it('lists workspaces with their status and the role that posted last', async () => {
    const { services, backend } = createHarness();
    const { workspace } = await services.workspaces.create('Goal');
    expect(await services.workspaces.list()).toMatchObject([{ id: workspace.id, status: 'running' }]);
    await backend.last().tool('post', { title: 't', message: 'm' });
    expect((await services.workspaces.list())[0]?.lastRole).toBe('scoper');
  });

  it('says so when a workspace does not exist', async () => {
    const { services } = createHarness();
    await expect(services.workspaces.state('nope')).rejects.toThrow('No workspace nope');
  });
});
