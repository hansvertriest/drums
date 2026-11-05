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
    expect(header.get('button.send').text()).toContain('Send');
    expect(header.get('button.send').attributes('disabled')).toBeDefined();
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
    { kind: 'text', seq: 3, agent: 'ag', at, text: 'Thinking **aloud**' },
  ];

  it('shows posts and errors, and what the agent says and does only with the toggle on', async () => {
    const store = withWorkspace();
    useThreads().load(posts, steps);
    const app = shell(store);
    const chat = app.get('section[aria-label="Chat"]');
    expect(chat.text()).toContain('the goal');
    expect(chat.text()).toContain('A note');
    expect(chat.text()).toContain('Not logged in');
    expect(chat.text()).not.toContain('artifact_create');
    expect(chat.text()).not.toContain('Thinking');
    await chat.get('button.steps').trigger('click');
    expect(chat.text()).toContain('artifact_create');
    expect(chat.get('.text b').text()).toBe('aloud');
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

describe('artifact tabs', () => {
  it('archives an artifact, hides its tab, and restores it from the archived list', async () => {
    const store = withWorkspace();
    const second = { ...artifact([1]), id: 'a2', title: 'Design' };
    useArtifacts().load([artifact([1]), second]);
    const app = shell(store);
    const stage = () => app.get('main.stage');
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ...artifact([1]), archived: true }), { status: 200 }));
    await app.get('button[aria-label="Archive Scope"]').trigger('click');
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledWith('/api/workspaces/w1/artifacts/a1/archive', expect.objectContaining({ method: 'POST' }));
    expect(stage().findAll('[role="tab"]').map((t) => t.text())).toEqual(['Design v1']);
    expect(useArtifacts().currentId).toBe('a2');
    await stage().get('button.toggle').trigger('click');
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(artifact([1])), { status: 200 }));
    await app.get('button[aria-label="Restore Scope"]').trigger('click');
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledWith('/api/workspaces/w1/artifacts/a1/restore', expect.objectContaining({ method: 'POST' }));
    expect(stage().find('button.toggle').exists()).toBe(false);
    expect(stage().findAll('[role="tab"]')).toHaveLength(2);
  });
});

describe('the composer', () => {
  it('sends pasted images with the message, and lets one be removed first', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 202 }));
    const app = shell(withWorkspace());
    const textarea = app.get('textarea[aria-label="Message"]');
    const file = (name: string) => new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png' });
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: { files: [file('a.png'), file('b.png')] } });
    textarea.element.dispatchEvent(event);
    await vi.waitFor(() => expect(app.findAll('.composer .image')).toHaveLength(2));
    expect(event.defaultPrevented).toBe(true);
    await app.get('button[aria-label="Remove image 2"]').trigger('click');
    await app.get('form.composer').trigger('submit');
    await flushPromises();
    const body = JSON.parse(fetchMock.mock.calls.at(-1)![1].body as string);
    expect(body).toEqual({ text: '', images: [{ type: 'image/png', data: 'AQID' }] });
    expect(app.findAll('.composer .image')).toHaveLength(0);
  });

  it('shows the images of a sent message', () => {
    const store = withWorkspace();
    useThreads().load([{ kind: 'message', seq: 1, agent: 'ag', at, text: '', images: ['i1.png'] }], []);
    expect(shell(store).get('.user img').attributes('src')).toBe('/api/workspaces/w1/images/i1.png');
  });

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

const newAgent = { id: 'ag2', role: 'reviewer', name: 'Reviewer', status: 'running' };

describe('agent tabs', () => {
  const two = () => {
    const store = withWorkspace();
    useAgents().load([
      { id: 'ag', role: 'scoper', name: 'Scoper', status: 'review' },
      { id: 'ag2', role: 'reviewer', name: 'Reviewer', status: 'running' },
    ]);
    return store;
  };

  it('shows one tab per agent with its status, and each its own thread', async () => {
    const store = two();
    useThreads().load(
      [
        { kind: 'message', seq: 1, agent: 'ag', at, text: 'for the scoper' },
        { kind: 'message', seq: 2, agent: 'ag2', at, text: 'for the reviewer' },
      ],
      [],
    );
    const app = shell(store);
    const chat = app.get('section[aria-label="Chat"]');
    const tabs = chat.findAll('[role="tab"]');
    expect(tabs.map((t) => t.text())).toEqual(['Scoper', 'Reviewer']);
    expect(tabs[1]?.get('i').classes()).toContain('st-running');
    expect(chat.text()).toContain('for the scoper');
    expect(chat.text()).not.toContain('for the reviewer');
    await tabs[1]?.trigger('click');
    expect(chat.text()).toContain('for the reviewer');
    expect(chat.text()).not.toContain('for the scoper');
  });

  it('sends to the agent whose tab is open', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 202 }));
    const store = two();
    const app = shell(store);
    await app.get('textarea[aria-label="Message"]').setValue('hello');
    await app.get('form.composer').trigger('submit');
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledWith('/api/workspaces/w1/agents/ag/messages', expect.anything());
  });

  it('closes an agent after confirming, and opens the next tab', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('confirm', () => true);
    const store = two();
    const app = shell(store);
    await app.get('button[aria-label="Close Scoper"]').trigger('click');
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledWith('/api/workspaces/w1/agents/ag/close', expect.objectContaining({ method: 'POST' }));
    expect(app.get('section[aria-label="Chat"]').findAll('[role="tab"]').map((t) => t.text())).toEqual(['Reviewer']);
    expect(useAgents().current?.id).toBe('ag2');
    expect(useAgents().nameOf('ag')).toBe('Scoper');
  });

  it('shows Stop only for an agent that runs', async () => {
    const store = two();
    const app = shell(store);
    expect(app.find('.working').exists()).toBe(false);
    await app.findAll('section[aria-label="Chat"] [role="tab"]')[1]?.trigger('click');
    expect(app.find('.working').exists()).toBe(true);
  });
});

describe('Add agent', () => {
  it('asks only what it should do, and opens the new tab', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(newAgent), { status: 201 }));
    const app = shell(withWorkspace());
    await app.get('button[aria-label="Add agent"]').trigger('click');
    const dialog = app.get('form[aria-label="Add agent"]');
    expect(dialog.text()).toContain('What should it do?');
    expect(dialog.text()).not.toMatch(/role|scoper|reviewer/i);
    expect(dialog.findAll('select')).toHaveLength(0);
    await dialog.get('textarea').setValue('Review it');
    await dialog.trigger('submit');
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledWith('/api/workspaces/w1/agents', expect.objectContaining({ method: 'POST', body: '{"instruction":"Review it"}' }));
    expect(app.find('form[aria-label="Add agent"]').exists()).toBe(false);
    expect(useAgents().current?.id).toBe('ag2');
    expect(app.findAll('[role="tab"]').map((t) => t.text())).toContain('Reviewer');
  });

  it('keeps the dialog and shows a refusal', async () => {
    const app = shell(withWorkspace());
    await app.get('button[aria-label="Add agent"]').trigger('click');
    await app.get('form[aria-label="Add agent"] textarea').setValue('Review it');
    await app.get('form[aria-label="Add agent"]').trigger('submit');
    await flushPromises();
    expect(useUi().error).toBe('refused here');
    expect(app.find('form[aria-label="Add agent"]').exists()).toBe(true);
  });
});

describe('the focus chip', () => {
  const onStage = () => {
    const store = withWorkspace();
    useArtifacts().load([artifact([1, 2])]);
    useArtifacts().open('a1');
    return store;
  };
  const sent = () => {
    const call = fetchMock.mock.calls.find(([path]) => String(path).endsWith('/messages'));
    return JSON.parse(call![1].body as string) as unknown;
  };

  it('shows what is on the stage, and goes along with the message', async () => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 202 }));
    const app = shell(onStage());
    expect(app.get('.chip').text()).toContain('About: Scope · v2');
    await app.get('textarea[aria-label="Message"]').setValue('review this');
    await app.get('form.composer').trigger('submit');
    await flushPromises();
    expect(sent()).toEqual({ text: 'review this', focus: { artifact: 'a1', version: 2 } });
  });

  it('follows the version the user opens', async () => {
    const app = shell(onStage());
    useArtifacts().open('a1', 1);
    await flushPromises();
    expect(app.get('.chip').text()).toContain('About: Scope · v1');
  });

  it('can be removed, and then the message goes without it', async () => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 202 }));
    const app = shell(onStage());
    await app.get('.chip button').trigger('click');
    expect(app.find('.chip').exists()).toBe(false);
    await app.get('textarea[aria-label="Message"]').setValue('in general');
    await app.get('form.composer').trigger('submit');
    await flushPromises();
    expect(sent()).toEqual({ text: 'in general' });
  });

  it('comes back when the user looks at something else', async () => {
    const app = shell(onStage());
    await app.get('.chip button').trigger('click');
    useArtifacts().open('a1', 1);
    await flushPromises();
    expect(app.get('.chip').text()).toContain('v1');
  });

  it('is absent with nothing on the stage', () => {
    expect(shell(withWorkspace()).find('.chip').exists()).toBe(false);
  });

  it('shows on the message in the thread what it was about', () => {
    const store = onStage();
    useThreads().load([{ kind: 'message', seq: 1, agent: 'ag', at, text: 'this', focus: { artifact: 'a1', version: 1 } }], []);
    expect(shell(store).get('.about').text()).toBe('About: Scope · v1');
  });
});

describe('Send with no answers', () => {
  it('sends the note to the tab that is open', async () => {
    fetchMock.mockImplementation(async () => new Response('{"recipients":["ag"]}', { status: 200 }));
    const app = shell(withWorkspace());
    await app.get('header .send').trigger('click');
    await app.get('[role="dialog"] textarea').setValue('Hi');
    await app.get('[role="dialog"] button.primary').trigger('click');
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledWith('/api/workspaces/w1/send', expect.objectContaining({ body: '{"overall":"Hi","to":"ag"}' }));
  });
});
