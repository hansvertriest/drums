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
  workspace: { id: 'w1', goal: 'Goal', createdAt: at, agents: [scoper] },
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
