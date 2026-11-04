import type { Artifact, Post, Step, WorkspaceSummary } from '@drums/protocol';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.vue';
import { useAgents } from './stores/agents';
import { useAnswers } from './stores/answers';
import { useArtifacts } from './stores/artifacts';
import { useThreads } from './stores/threads';
import { useUi } from './stores/ui';
import { useWorkspaces } from './stores/workspaces';

const at = '2026-01-01T10:00:00.000Z';
const summary: WorkspaceSummary = { id: 'w1', goal: 'Scope checkout', status: 'input' };
const artifact = (versions: number[]): Artifact => ({
  id: 'a1',
  title: 'Scope',
  kind: 'html',
  renderer: 'html',
  createdAt: at,
  versions: versions.map((version) => ({ version, by: 'ag', note: `note ${version}`, at })),
});

const pinia = () => {
  const store = createPinia();
  setActivePinia(store);
  return store;
};
const shell = (store = pinia()) => mount(App, { global: { plugins: [store] } });

/** A workspace on screen, without a server. */
function withWorkspace() {
  const store = pinia();
  const workspaces = useWorkspaces();
  workspaces.workspaces = [summary];
  workspaces.currentId = 'w1';
  useAgents().load([{ id: 'ag', role: 'scoper', name: 'Scoper', status: 'input' }]);
  return store;
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: 'refused here' }), { status: 409 }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('App without a workspace', () => {
  it('shows the header with the logo and a disabled Send', () => {
    const header = shell().get('header');
    expect(header.get('[aria-label="drums"]').text()).toBe('d');
    expect(header.get('button').text()).toContain('Send');
    expect(header.get('button').attributes('disabled')).toBeDefined();
  });

  it('shows the strip with New workspace, and no role picker in its dialog', async () => {
    const app = shell();
    expect(app.get('aside').text()).toContain('New workspace');
    await app.get('aside .new').trigger('click');
    const dialog = app.get('form[aria-label="New workspace"]');
    expect(dialog.text()).toContain('Goal');
    expect(dialog.text()).not.toMatch(/role|scoper/i);
  });

  it('shows an empty stage and no chat', () => {
    const app = shell();
    expect(app.get('main').text()).toContain('Nothing here yet');
    expect(app.find('section[aria-label="Chat"]').exists()).toBe(false);
  });
});

describe('the thread', () => {
  const posts: Post[] = [
    { kind: 'message', seq: 1, agent: 'ag', at, text: 'the goal' },
    { kind: 'note', seq: 2, agent: 'ag', at, title: 'A note', message: 'with `code` <img src=x>' },
    { kind: 'version', seq: 3, agent: 'ag', at, title: 'Scope', message: 'first', artifact: 'a1', version: 1 },
  ];
  const steps: Step[] = [
    { kind: 'tool', seq: 1, agent: 'ag', at, tool: 'artifact_create', summary: 'title: Scope' },
    { kind: 'error', seq: 2, agent: 'ag', at, text: 'Not logged in' },
  ];

  it('shows posts, errors, and tool steps only with the toggle on', async () => {
    const store = withWorkspace();
    useThreads().load(posts, steps);
    const app = shell(store);
    const chat = app.get('section[aria-label="Chat"]');
    expect(chat.text()).toContain('the goal');
    expect(chat.text()).toContain('A note');
    expect(chat.text()).toContain('Not logged in');
    expect(chat.text()).not.toContain('artifact_create');
    await chat.get('button.steps').trigger('click');
    expect(chat.text()).toContain('artifact_create');
  });

  it('keeps agent markup out of the page', () => {
    const store = withWorkspace();
    useThreads().load(posts, []);
    expect(shell(store).find('section[aria-label="Chat"] img').exists()).toBe(false);
  });

  it('opens a version from its post', async () => {
    const store = withWorkspace();
    useThreads().load(posts, []);
    useArtifacts().load([artifact([1, 2])]);
    const app = shell(store);
    await app.get('button.open').trigger('click');
    expect(useArtifacts().viewing).toBe(1);
    expect(useArtifacts().isLatest).toBe(false);
  });
});

describe('the composer', () => {
  it('sends a message to the agent', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 202 }));
    const app = shell(withWorkspace());
    await app.get('textarea[aria-label="Message"]').setValue('hello');
    await app.get('form.composer').trigger('submit');
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledWith('/api/workspaces/w1/agents/ag/messages', expect.objectContaining({ method: 'POST', body: '{"text":"hello"}' }));
  });

  it('shows Stop while the agent runs and does not send', async () => {
    const store = withWorkspace();
    useAgents().setStatus('ag', 'running');
    const app = shell(store);
    expect(app.get('.working').text()).toContain('Stop');
    await app.get('textarea[aria-label="Message"]').setValue('hello');
    await app.get('form.composer').trigger('submit');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the text and shows the refusal', async () => {
    const app = shell(withWorkspace());
    await app.get('textarea[aria-label="Message"]').setValue('hello');
    await app.get('form.composer').trigger('submit');
    await flushPromises();
    expect(useUi().error).toBe('refused here');
    expect((app.get('textarea[aria-label="Message"]').element as HTMLTextAreaElement).value).toBe('hello');
  });
});

describe('the stage and Send', () => {
  it('shows tabs with the pending count, and fills Send', () => {
    const store = withWorkspace();
    useArtifacts().load([artifact([1])]);
    useAnswers().load([{ artifact: 'a1', version: 1, answers: [{ name: 'q', label: 'Q', value: 'x' }] }]);
    const app = shell(store);
    expect(app.get('main .tabs .count').text()).toBe('1');
    expect(app.get('header .send').classes()).toContain('primary');
    expect(app.get('header .send .count').text()).toBe('1');
  });

  it('does not count sent answers as pending', () => {
    const store = withWorkspace();
    useArtifacts().load([artifact([1])]);
    useAnswers().load([{ artifact: 'a1', version: 1, answers: [{ name: 'q', label: 'Q', value: 'x' }], sentAt: at }]);
    const app = shell(store);
    expect(app.get('header .send .count').text()).toBe('0');
    expect(app.find('main .tabs .count').exists()).toBe(false);
  });

  it('marks older versions read-only with a Latest link', async () => {
    const store = withWorkspace();
    useArtifacts().load([artifact([1, 2])]);
    useArtifacts().open('a1', 1);
    const app = shell(store);
    expect(app.get('main .old').text()).toContain('Read-only');
    await app.get('main .old button').trigger('click');
    expect(useArtifacts().isLatest).toBe(true);
  });

  it('lists pending answers in Send and posts them with the note', async () => {
    fetchMock.mockImplementation(async () => new Response('{"recipients":["ag"]}', { status: 200 }));
    const store = withWorkspace();
    useArtifacts().load([artifact([1])]);
    useAnswers().load([{ artifact: 'a1', version: 1, answers: [{ name: 'q', label: 'Provider', value: 'Stripe' }] }]);
    const app = shell(store);
    await app.get('header .send').trigger('click');
    const pop = app.get('[role="dialog"]');
    expect(pop.text()).toContain('Provider');
    expect(pop.text()).toContain('Stripe');
    expect(pop.text()).toContain('→ Scoper');
    await pop.get('textarea').setValue('Keep it small');
    await pop.get('button.primary').trigger('click');
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledWith('/api/workspaces/w1/send', expect.objectContaining({ body: '{"overall":"Keep it small"}' }));
    expect(useUi().sendOpen).toBe(false);
  });
});
