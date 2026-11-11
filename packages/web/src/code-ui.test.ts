import type { Post, WorkspaceSummary } from '@drums/protocol';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.vue';
import { useAgents } from './stores/agents';
import { useArtifacts } from './stores/artifacts';
import { useMap } from './stores/map';
import { useThreads } from './stores/threads';
import { useUi } from './stores/ui';
import { useWorkspaces } from './stores/workspaces';

const at = '2026-01-01T10:00:00.000Z';
const summary: WorkspaceSummary = { id: 'w1', goal: 'Add paging', status: 'input', additions: 3, deletions: 1 };
const mapArtifact = { id: 'a1', title: 'Branch map', kind: 'branch-map', renderer: 'branch-map', createdAt: at, versions: [] };
const repo = (name: string, extra: object = {}) => ({
  name,
  base: 'main',
  files: 1,
  additions: 3,
  deletions: 1,
  pendingComments: 0,
  viewer: `/map/t/w1/${name}/`,
  ...extra,
});
const row = { id: 'p1', agent: 'ag', tool: 'Bash', title: 'Run a command', detail: 'command: curl x', at, status: 'pending' as const };

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function app(repos = [repo('shop')]) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const workspaces = useWorkspaces();
  workspaces.workspaces = [summary];
  workspaces.currentId = 'w1';
  useAgents().load([{ id: 'ag', role: 'coder', name: 'Coder', status: 'input' }]);
  useMap().repos = repos;
  useMap().branch = 'drums/paging';
  useArtifacts().load([mapArtifact]);
  return mount(App, { global: { plugins: [pinia] } });
}

describe('the branch map', () => {
  it('shows the viewer in a sandboxed frame with no origin, and no version picker', async () => {
    const wrapper = app();
    await flushPromises();
    const frame = wrapper.get('iframe[title^="Branch map"]');
    expect(frame.attributes('sandbox')).toBe('allow-scripts allow-forms');
    expect(frame.attributes('src')).toBe('/map/t/w1/shop/');
    expect(wrapper.find('[data-version-trigger]').exists()).toBe(false);
    expect(wrapper.find('.switch').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Repos"]').exists()).toBe(false);
  });

  it('switches between repos', async () => {
    const wrapper = app([repo('shop'), repo('web', { additions: 7 })]);
    await flushPromises();
    const tabs = wrapper.get('[aria-label="Repos"]').findAll('button');
    expect(tabs.map((tab) => tab.text())).toEqual(['shop +3 −1', 'web +7 −1']);
    await tabs[1]!.trigger('click');
    expect(wrapper.get('iframe[title^="Branch map"]').attributes('src')).toBe('/map/t/w1/web/');
  });

  it('says so if a session could not start', async () => {
    const wrapper = app([repo('shop', { viewer: undefined, error: 'The code session of shop could not start: bad object' })]);
    await flushPromises();
    expect(wrapper.find('iframe[title^="Branch map"]').exists()).toBe(false);
    expect(wrapper.get('[role=alert]').text()).toContain('could not start');
  });
});

describe('the bars on code', () => {
  const details = async (wrapper: ReturnType<typeof app>) => {
    await wrapper.get('.heading [data-details-trigger]').trigger('click');
    return wrapper.get('[role="dialog"][aria-label="Workspace details"]');
  };

  it('has the comment count in the bar, the branch and repos in the details, and no PR button', async () => {
    const wrapper = app([repo('shop', { pendingComments: 2 })]);
    await flushPromises();
    const bar = wrapper.get('header.stage-bar');
    expect(bar.text()).not.toContain('Open PR');
    expect(bar.get('.send.primary .count').text()).toBe('2');
    const panel = await details(wrapper);
    expect(panel.text()).toContain('drums/paging');
    expect(panel.text()).toContain('shop');
  });

  it('archives the workspace from the details, after asking', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    const wrapper = app();
    await flushPromises();
    const panel = await details(wrapper);
    await panel.findAll('button').find((b) => b.text() === 'Archive')!.trigger('click');
    await flushPromises();
    expect(window.confirm).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith('/api/workspaces/w1/archive', expect.objectContaining({ method: 'POST' }));
    expect(wrapper.find('[aria-label="Workspace details"]').exists()).toBe(false);
  });

  it('moves the name to the stage bar when the chat is folded', async () => {
    const wrapper = app();
    await flushPromises();
    expect(wrapper.find('.stage-bar .crumb').exists()).toBe(false);
    await wrapper.get('[aria-label="Collapse chat"]').trigger('click');
    expect(wrapper.get('.stage-bar .crumb').text()).toBe('Add paging');
    useUi().toggleRail();
  });

  it('routes comments in the Send panel to whoever the server names', async () => {
    const wrapper = app([repo('shop', { pendingComments: 1 })]);
    useMap().commentsTo = 'ag';
    useUi().sendOpen = true;
    await flushPromises();
    expect(wrapper.get('.pop').text()).toContain('Code comments → Coder');
    expect(wrapper.get('.pop').text()).toContain('1 comment');
    expect(wrapper.get('.pop button.primary').attributes('disabled')).toBeUndefined();
  });
});

describe('a permission row', () => {
  it('shows the call, and answers it', async () => {
    const wrapper = app();
    useThreads().load([], [], [row]);
    await flushPromises();
    const shown = wrapper.get('.row.pending');
    expect(shown.text()).toContain('command: curl x');
    await shown.findAll('button').find((b) => b.text() === 'Deny')!.trigger('click');
    await flushPromises();
    const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
    expect(url).toBe('/api/workspaces/w1/agents/ag/permissions/p1');
    expect(JSON.parse(init.body as string)).toEqual({ decision: 'deny' });
  });

  it('blocks the composer while it waits, but Stop stays', async () => {
    const wrapper = app();
    useThreads().load([], [], [row]);
    await flushPromises();
    expect(wrapper.get('.working').text()).toContain('Waiting for your answer');
    expect(wrapper.get('.composer .round').attributes('aria-label')).toBe('Stop');
    expect(wrapper.get('textarea[aria-label=Message]').attributes('placeholder')).toContain('waiting for your answer');
  });

  it('says how it ended once answered', async () => {
    const wrapper = app();
    useThreads().load([], [], [{ ...row, status: 'expired' }]);
    await flushPromises();
    expect(wrapper.find('.row.pending').exists()).toBe(false);
    expect(wrapper.get('.row').text()).toContain('No longer waiting');
    expect(wrapper.find('.working').exists()).toBe(false);
  });
});

describe('thread entries of code', () => {
  it('shows a checkpoint with its repos, and opens the map', async () => {
    const wrapper = app();
    const checkpoint: Post = {
      kind: 'checkpoint',
      seq: 1,
      agent: 'ag',
      at,
      title: 'Paging',
      message: 'Adds `list`',
      artifact: 'a1',
      version: 1,
      repos: [{ name: 'shop', post: 1, files: 2, additions: 9, deletions: 1, symbols: 1 }],
    };
    useThreads().load([checkpoint], []);
    await flushPromises();
    expect(wrapper.get('.post').text()).toContain('shop · 2 files');
    expect(wrapper.get('.post .open').attributes('aria-label')).toContain('Paging');
  });

  it('shows how many comments Send delivered', async () => {
    const wrapper = app();
    const feedback: Post = { kind: 'feedback', seq: 1, agent: 'ag', at, items: [], code: [{ repo: 'shop', comments: 2, markdown: '## x' }] };
    useThreads().load([feedback], []);
    await flushPromises();
    expect(wrapper.get('.user').text()).toContain('2 comments on shop');
  });
});
