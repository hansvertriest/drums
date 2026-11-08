import type { DomainEvent, Post, WorkspaceState, WorkspaceSummary } from '@drums/protocol';
import { flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAgents } from './agents';
import { useArtifacts } from './artifacts';
import { useThreads } from './threads';
import { useWorkspaces } from './workspaces';

const at = '2026-01-01T10:00:00.000Z';
const scoper = { id: 'ag', role: 'scoper', name: 'Scoper', status: 'running' as const };
const state = (posts: Post[] = []): WorkspaceState => ({
  workspace: { id: 'w1', goal: 'Goal', createdAt: at, agents: [scoper], repos: [], permissions: [], nudges: {} },
  posts,
  steps: [],
  artifacts: [],
  answers: [],
});
const note = (seq: number): Post => ({ kind: 'note', seq, agent: 'ag', at, title: `p${seq}`, message: '' });

class FakeEventSource {
  static last: FakeEventSource;
  listeners: Record<string, () => void> = {};
  onmessage?: (message: { data: string }) => void;
  closed = false;
  constructor(readonly url: string) {
    FakeEventSource.last = this;
  }
  addEventListener(name: string, listener: () => void) {
    this.listeners[name] = listener;
  }
  close() {
    this.closed = true;
  }
  event(event: DomainEvent) {
    this.onmessage?.({ data: JSON.stringify(event) });
  }
}

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

let list: WorkspaceSummary[];
let answer: () => Promise<Response>;
const fetchMock = vi.fn(async (path: string) => (path === '/api/workspaces' ? json(list) : answer()));

beforeEach(() => {
  sessionStorage.clear();
  setActivePinia(createPinia());
  list = [{ id: 'w1', goal: 'Goal', status: 'running' }];
  answer = async () => json(state());
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('EventSource', FakeEventSource);
  window.location.hash = '';
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('the workspaces store', () => {
  it('adds a tab when an agent is added, once', async () => {
    const store = useWorkspaces();
    await store.open('w1');
    const reviewer = { id: 'ag2', role: 'reviewer', name: 'Reviewer', status: 'running' as const };
    FakeEventSource.last.event({ type: 'agent.added', workspace: 'w1', agent: reviewer });
    FakeEventSource.last.event({ type: 'agent.added', workspace: 'w1', agent: reviewer });
    expect(useAgents().agents.map((a) => a.name)).toEqual(['Scoper', 'Reviewer']);
    expect(useAgents().current?.id).toBe('ag');
  });

  it('keeps events that arrive while a reload is on its way', async () => {
    const store = useWorkspaces();
    await store.open('w1');
    let respond: (response: Response) => void = () => {};
    answer = () => new Promise((resolve) => (respond = resolve));
    FakeEventSource.last.listeners.ready?.();
    await flushPromises();

    FakeEventSource.last.event({ type: 'post.created', workspace: 'w1', post: note(2) });
    FakeEventSource.last.event({ type: 'agent.status', workspace: 'w1', agent: 'ag', status: 'review' });
    respond(json(state([note(1)])));
    await flushPromises();

    expect(useThreads().posts.map((p) => p.seq)).toEqual([1, 2]);
    expect(useAgents().current?.status).toBe('review');
  });

  it('refreshes the strip when told another workspace changed, once per burst', async () => {
    vi.useFakeTimers();
    const store = useWorkspaces();
    await store.refreshList();
    await store.open('w1');
    list = [
      { id: 'w1', goal: 'Goal', status: 'running' },
      { id: 'w2', goal: 'Other', status: 'input' },
    ];
    fetchMock.mockClear();
    for (let i = 0; i < 5; i++) FakeEventSource.last.listeners['workspaces.changed']?.();
    await vi.advanceTimersByTimeAsync(300);
    expect(fetchMock.mock.calls.filter(([path]) => path === '/api/workspaces')).toHaveLength(1);
    expect(store.workspaces.find((w) => w.id === 'w2')?.status).toBe('input');
  });

  it('leaves the stage alone when an agent the user is not watching posts', async () => {
    const store = useWorkspaces();
    await store.open('w1');
    const artifact = (id: string, by: string) => ({
      id,
      title: id,
      kind: 'html',
      renderer: 'html',
      createdAt: at,
      versions: [{ version: 1, by, note: '', at }],
    });
    FakeEventSource.last.event({ type: 'artifact.version', workspace: 'w1', artifact: artifact('a1', 'ag'), version: 1 });
    FakeEventSource.last.event({ type: 'artifact.version', workspace: 'w1', artifact: artifact('a2', 'other'), version: 1 });
    expect(useArtifacts().currentId).toBe('a1');
    expect(useArtifacts().artifacts).toHaveLength(2);
    FakeEventSource.last.event({ type: 'artifact.version', workspace: 'w1', artifact: artifact('a3', 'ag'), version: 1 });
    expect(useArtifacts().currentId).toBe('a3');
  });
});

describe('coming back to a workspace', () => {
  const agent = (id: string, closed = false) => ({ id, role: 'coder', name: id, status: 'idle' as const, closed });
  const artifact = (id: string, versions: number[] = [1], archived = false) => ({
    id,
    title: id,
    kind: 'html',
    renderer: 'html',
    createdAt: at,
    archived,
    versions: versions.map((version) => ({ version, by: 'a1', note: '', at })),
  });
  type Tabs = { agents: ReturnType<typeof agent>[]; artifacts: ReturnType<typeof artifact>[] };
  const of = (id: string, tabs: Tabs): WorkspaceState => ({
    workspace: { id, goal: id, createdAt: at, agents: tabs.agents, repos: [], permissions: [], nudges: {} },
    posts: [],
    steps: [],
    artifacts: tabs.artifacts,
    answers: [],
  });

  let tabs: Record<string, Tabs>;
  beforeEach(() => {
    tabs = {
      w1: { agents: [agent('a1'), agent('a2')], artifacts: [artifact('b1'), artifact('b2', [1, 2])] },
      w2: { agents: [agent('c1'), agent('c2')], artifacts: [artifact('d1'), artifact('d2')] },
    };
    fetchMock.mockImplementation(async (path: string) => {
      if (path === '/api/workspaces') return json(list);
      const id = /^\/api\/workspaces\/([^/]+)$/.exec(path)?.[1];
      return id ? json(of(id, tabs[id]!)) : json({});
    });
  });
  afterEach(() => fetchMock.mockImplementation(async (path: string) => (path === '/api/workspaces' ? json(list) : answer())));

  /** Opens w1, moves to its second agent and artifact, and goes to w2. */
  const leaveW1 = async () => {
    const store = useWorkspaces();
    await store.open('w1');
    useAgents().currentId = 'a2';
    useArtifacts().open('b2');
    await flushPromises();
    await store.open('w2');
    await flushPromises();
    return store;
  };
  const shown = () => [useAgents().current?.id, useArtifacts().currentId];

  it('starts on the first tabs, and returns to the ones you were on, per workspace', async () => {
    const store = await leaveW1();
    expect(shown()).toEqual(['c1', 'd1']);
    useAgents().currentId = 'c2';
    useArtifacts().open('d2');
    await flushPromises();

    await store.open('w1');
    await flushPromises();
    expect(shown()).toEqual(['a2', 'b2']);

    await store.open('w2');
    await flushPromises();
    expect(shown()).toEqual(['c2', 'd2']);
  });

  it('survives going through defaults: opening does not overwrite what was saved', async () => {
    const store = await leaveW1();
    await store.open('w1');
    await flushPromises();
    await store.open('w2');
    await flushPromises();
    await store.open('w1');
    await flushPromises();
    expect(shown()).toEqual(['a2', 'b2']);
  });

  it('uses the first tab if the saved agent was closed or the saved artifact archived', async () => {
    const store = await leaveW1();
    tabs.w1 = { agents: [agent('a1'), agent('a2', true)], artifacts: [artifact('b1'), artifact('b2', [1, 2], true)] };
    await store.open('w1');
    await flushPromises();
    expect(shown()).toEqual(['a1', 'b1']);
  });

  it('opens the latest version of the saved artifact', async () => {
    const store = useWorkspaces();
    await store.open('w1');
    useArtifacts().open('b2', 1);
    await flushPromises();
    expect(useArtifacts().viewing).toBe(1);
    await store.open('w2');
    await flushPromises();
    await store.open('w1');
    await flushPromises();
    expect(useArtifacts().currentId).toBe('b2');
    expect(useArtifacts().viewing).toBe(2);
  });

  it('does not jump to the saved tab on a live reload', async () => {
    const store = useWorkspaces();
    await store.open('w1');
    sessionStorage.setItem('drums.tabs.w1', JSON.stringify({ agent: 'a2', artifact: 'b2' }));
    FakeEventSource.last.listeners.ready?.();
    await flushPromises();
    expect(shown()).toEqual(['a1', 'b1']);
    expect(store.currentId).toBe('w1');
  });

  it('keeps the tab you moved to during a live reload, and restores once if the stream connects first', async () => {
    const store = await leaveW1();
    let respond: (response: Response) => void = () => {};
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => (respond = resolve)));
    const opening = store.open('w1');
    FakeEventSource.last.listeners.ready?.();
    await flushPromises();
    expect(shown()).toEqual(['a2', 'b2']);

    useAgents().currentId = 'a1';
    respond(json(of('w1', tabs.w1!)));
    await opening;
    await flushPromises();
    expect(shown()).toEqual(['a1', 'b2']);
  });

  it('survives a broken stored value', async () => {
    sessionStorage.setItem('drums.tabs.w1', '{nope');
    await useWorkspaces().open('w1');
    expect(shown()).toEqual(['a1', 'b1']);
  });
});
