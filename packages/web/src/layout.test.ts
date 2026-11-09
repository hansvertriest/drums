import type { DomainEvent, Post, WorkspaceState, WorkspaceSummary } from '@drums/protocol';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, getActivePinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.vue';
import { useAgents } from './stores/agents';
import { useNews } from './stores/news';
import { useUi } from './stores/ui';
import { useWorkspaces } from './stores/workspaces';

const at = '2026-01-01T10:00:00.000Z';
const summary: WorkspaceSummary = { id: 'w1', goal: 'Scope checkout', status: 'review' };
const state = (id: string): WorkspaceState => ({
  workspace: { id, goal: 'Goal', createdAt: at, agents: [{ id: 'ag', role: 'scoper', name: 'Scoper', status: 'idle' }], repos: [], permissions: [], nudges: {}, handoversInARow: 0 },
  posts: [],
  steps: [],
  artifacts: [],
  answers: [],
});
const note = (seq: number, kind: 'note' | 'message' = 'note'): Post =>
  kind === 'note' ? { kind, seq, agent: 'ag', at, title: `p${seq}`, message: '' } : { kind, seq, agent: 'ag', at, text: 'mine' };

class FakeEventSource {
  static last: FakeEventSource;
  onmessage?: (message: { data: string }) => void;
  onerror?: () => void;
  private listeners = new Map<string, () => void>();
  constructor(readonly url: string) {
    FakeEventSource.last = this;
  }
  addEventListener(type: string, listener: () => void) {
    this.listeners.set(type, listener);
  }
  ready() {
    this.listeners.get('ready')?.();
  }
  close() {}
  event(event: DomainEvent) {
    this.onmessage?.({ data: JSON.stringify(event) });
  }
}

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
let list: WorkspaceSummary[];

beforeEach(() => {
  localStorage.clear();
  list = [summary];
  setActivePinia(createPinia());
  vi.stubGlobal('EventSource', FakeEventSource);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string) => {
      if (path === '/api/workspaces') return json(list);
      const id = /^\/api\/workspaces\/([^/]+)$/.exec(path)?.[1];
      return id ? json(state(id)) : new Response(JSON.stringify({ error: 'no' }), { status: 404 });
    }),
  );
  window.location.hash = '';
});
afterEach(() => vi.unstubAllGlobals());

const shell = () => mount(App, { attachTo: document.body, global: { plugins: [getActivePinia()!] } });

const withWorkspace = () => {
  const workspaces = useWorkspaces();
  workspaces.workspaces = [summary];
  workspaces.currentId = 'w1';
  useAgents().load([{ id: 'ag', role: 'scoper', name: 'Scoper', status: 'idle' }]);
  return shell();
};

const press = (target: EventTarget, init: KeyboardEventInit = {}) => target.dispatchEvent(new KeyboardEvent('keydown', { key: '\\', bubbles: true, ...init }));

describe('collapsing the rail', () => {
  it('folds with the icon in the heading and comes back with the floating one', async () => {
    const app = withWorkspace();
    expect(app.find('.fab').exists()).toBe(false);
    await app.get('[aria-label="Collapse chat"]').trigger('click');
    expect(app.get('.body').classes()).toContain('collapsed');
    await app.get('.fab').trigger('click');
    expect(app.get('.body').classes()).not.toContain('collapsed');
    expect(app.find('.fab').exists()).toBe(false);
    app.unmount();
  });

  it('folds with \\ , and is remembered per browser', async () => {
    const app = withWorkspace();
    press(document.body);
    await flushPromises();
    expect(app.find('.fab').exists()).toBe(true);
    expect(localStorage.getItem('drums.rail')).toBe('collapsed');
    press(document.body);
    await flushPromises();
    expect(app.find('.fab').exists()).toBe(false);
    expect(localStorage.getItem('drums.rail')).toBe('open');
    app.unmount();
    localStorage.setItem('drums.rail', 'collapsed');
    setActivePinia(createPinia());
    expect(useUi().railCollapsed).toBe(true);
  });

  it('never fires while typing, with a modifier, or with no workspace', async () => {
    const app = withWorkspace();
    const ui = useUi();
    press(app.get('textarea').element);
    await flushPromises();
    expect(ui.railCollapsed).toBe(false);
    const input = document.createElement('input');
    const select = document.createElement('select');
    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    document.body.append(input, select, editable);
    for (const target of [input, select]) press(target);
    press(document.body, { metaKey: true });
    press(document.body, { ctrlKey: true });
    expect(ui.railCollapsed).toBe(false);
    for (const element of [input, select, editable]) element.remove();
    useWorkspaces().currentId = undefined;
    press(document.body);
    expect(ui.railCollapsed).toBe(false);
    app.unmount();
  });

  it('keeps what is being typed while folded', async () => {
    const app = withWorkspace();
    await app.get('textarea').setValue('half a thought');
    await app.get('[aria-label="Collapse chat"]').trigger('click');
    await app.get('.fab').trigger('click');
    expect((app.get('textarea').element as HTMLTextAreaElement).value).toBe('half a thought');
    app.unmount();
  });

  it('gets a dot when an agent posts while folded, not for your own messages, and loses it on opening', async () => {
    const workspaces = useWorkspaces();
    await workspaces.refreshList();
    await workspaces.open('w1');
    const app = shell();
    await flushPromises();
    await app.get('[aria-label="Collapse chat"]').trigger('click');
    expect(app.find('.fab .dot').exists()).toBe(false);

    FakeEventSource.last.event({ type: 'post.created', workspace: 'w1', post: note(1, 'message') });
    await flushPromises();
    expect(app.find('.fab .dot').exists()).toBe(false);

    FakeEventSource.last.event({ type: 'post.created', workspace: 'w1', post: note(2) });
    await flushPromises();
    expect(app.find('.fab .dot').exists()).toBe(true);

    await app.get('.fab').trigger('click');
    await app.get('[aria-label="Collapse chat"]').trigger('click');
    expect(app.find('.fab .dot').exists()).toBe(false);

    await app.get('.fab').trigger('click');
    FakeEventSource.last.event({ type: 'post.created', workspace: 'w1', post: note(3) });
    await flushPromises();
    await app.get('[aria-label="Collapse chat"]').trigger('click');
    expect(app.find('.fab .dot').exists()).toBe(false);
    app.unmount();
  });
});

describe('resizing the rail', () => {
  it('widens with the keyboard within bounds, remembers it, and resets on double-click', async () => {
    const app = withWorkspace();
    const handle = app.get('[aria-label="Resize chat"]');
    expect(app.get('.body').attributes('style')).toContain('--rail-width: 360px');
    await handle.trigger('keydown', { key: 'ArrowRight' });
    expect(app.get('.body').attributes('style')).toContain('--rail-width: 384px');
    expect(localStorage.getItem('drums.rail-width')).toBe('384');
    useUi().setRailWidth(10);
    expect(useUi().railWidth).toBe(280);
    await handle.trigger('dblclick');
    expect(useUi().railWidth).toBe(360);
  });
});

describe('phones', () => {
  it('opens the drawer from the menu button and closes it on picking a workspace', async () => {
    const app = withWorkspace();
    await app.get('[aria-label="Workspaces"].menu').trigger('click');
    expect(app.get('aside').classes()).toContain('open');
    await app.get('aside .item').trigger('click');
    await flushPromises();
    expect(app.get('aside').classes()).not.toContain('open');
    app.unmount();
  });

  it('closes the drawer on a tap beside it', async () => {
    const app = withWorkspace();
    await app.get('[aria-label="Workspaces"].menu').trigger('click');
    await app.get('.scrim').trigger('click');
    expect(app.get('aside').classes()).not.toContain('open');
    app.unmount();
  });

  it('has two tabs that switch the body, and opening an artifact goes to the stage', async () => {
    const app = withWorkspace();
    const tabs = app.findAll('[aria-label="Chat or artifacts"] button');
    expect(tabs.map((tab) => tab.text())).toEqual(['Chat', 'Artifacts']);
    expect(app.get('.body').attributes('data-tab')).toBe('chat');
    await tabs[1]!.trigger('click');
    expect(app.get('.body').attributes('data-tab')).toBe('stage');
    expect(tabs[1]!.attributes('aria-selected')).toBe('true');
    app.unmount();
  });
});

describe('the Chat tab on phones', () => {
  it('gets a dot when an agent posts while Artifacts is open, and loses it on going back', async () => {
    const workspaces = useWorkspaces();
    await workspaces.refreshList();
    await workspaces.open('w1');
    const app = shell();
    await flushPromises();
    const tabs = () => app.findAll('[aria-label="Chat or artifacts"] button');
    await tabs()[1]!.trigger('click');

    FakeEventSource.last.event({ type: 'post.created', workspace: 'w1', post: note(1, 'message') });
    await flushPromises();
    expect(app.find('[aria-label="Chat or artifacts"] .dot').exists()).toBe(false);

    FakeEventSource.last.event({ type: 'post.created', workspace: 'w1', post: note(2) });
    await flushPromises();
    expect(app.find('[aria-label="Chat or artifacts"] .dot').exists()).toBe(true);

    await tabs()[0]!.trigger('click');
    expect(app.find('[aria-label="Chat or artifacts"] .dot').exists()).toBe(false);
    app.unmount();
  });

  it('shows a dot on the logo for news in another workspace', async () => {
    list = [summary, { id: 'w2', goal: 'Other', status: 'review', lastPost: 3 }];
    const workspaces = useWorkspaces();
    await workspaces.refreshList();
    await workspaces.open('w1');
    const app = shell();
    await flushPromises();
    expect(app.find('.menu .news').exists()).toBe(false);
    list = [summary, { id: 'w2', goal: 'Other', status: 'review', lastPost: 4 }];
    await workspaces.refreshList();
    await flushPromises();
    expect(app.find('.menu .news').exists()).toBe(true);
    app.unmount();
  });
});

describe('not reaching the server', () => {
  const lost = (app: ReturnType<typeof shell>) => app.text().includes("Can't reach drums");

  it('says so when the first load fails, and Try again recovers', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const app = shell();
    await useWorkspaces().boot();
    await flushPromises();
    expect(lost(app)).toBe(true);
    await app.get('.lost button').trigger('click');
    await flushPromises();
    expect(lost(app)).toBe(false);
    expect(useWorkspaces().currentId).toBe('w1');
    app.unmount();
  });

  it('shows lines instead of the empty page while loading', async () => {
    let answer: (response: Response) => void = () => {};
    vi.mocked(fetch).mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
    const app = shell();
    const booting = useWorkspaces().boot();
    await flushPromises();
    expect(app.find('.skeleton').exists()).toBe(true);
    expect(app.text()).not.toContain('No workspace yet');
    answer(json([]));
    await booting;
    await flushPromises();
    expect(app.find('.skeleton').exists()).toBe(false);
    expect(app.text()).toContain('No workspace yet');
    app.unmount();
  });

  it('says so only when the stream stays down, and clears when it is back', async () => {
    const workspaces = useWorkspaces();
    await workspaces.refreshList();
    await workspaces.open('w1');
    const app = shell();
    await flushPromises();
    vi.useFakeTimers();
    try {
      FakeEventSource.last.onerror?.();
      await vi.advanceTimersByTimeAsync(7000);
      expect(lost(app)).toBe(false);
      await vi.advanceTimersByTimeAsync(2000);
      expect(lost(app)).toBe(true);
      FakeEventSource.last.ready();
      await vi.advanceTimersByTimeAsync(0);
      expect(lost(app)).toBe(false);

      FakeEventSource.last.onerror?.();
      FakeEventSource.last.ready();
      await vi.advanceTimersByTimeAsync(9000);
      expect(lost(app)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
    app.unmount();
  });
});

describe('the news dot on the strip', () => {
  const dots = (app: ReturnType<typeof shell>) => app.findAll('aside .news').length;
  const other: WorkspaceSummary = { id: 'w2', goal: 'Other', status: 'review', lastPost: 3 };

  it('shows nothing for what was already there, and shows what came since you looked', async () => {
    list = [{ ...summary, lastPost: 1 }, other];
    const workspaces = useWorkspaces();
    await workspaces.refreshList();
    await workspaces.open('w1');
    const app = shell();
    await flushPromises();
    expect(dots(app)).toBe(0);

    list = [{ ...summary, lastPost: 2 }, { ...other, lastPost: 4 }];
    await workspaces.refreshList();
    await flushPromises();
    expect(dots(app)).toBe(1);

    await workspaces.open('w2');
    await flushPromises();
    expect(dots(app)).toBe(0);
    app.unmount();
  });

  it('remembers what you saw across a reload', async () => {
    useNews().update([other], undefined);
    setActivePinia(createPinia());
    expect(useNews().hasNews({ ...other, lastPost: 3 })).toBe(false);
    expect(useNews().hasNews({ ...other, lastPost: 4 })).toBe(true);
  });

  it('survives a broken stored value', () => {
    localStorage.setItem('drums.seen', '{nope');
    setActivePinia(createPinia());
    expect(useNews().hasNews(other)).toBe(false);
  });
});
