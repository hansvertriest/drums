import type { DomainEvent, WorkspaceId, WorkspaceState, WorkspaceSummary } from '@drums/protocol';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { api } from '../api/client';
import { subscribe } from '../api/live';
import { useAgents } from './agents';
import { useAnswers } from './answers';
import { useArtifacts } from './artifacts';
import { useThreads } from './threads';
import { useUi } from './ui';

/** A busy workspace changes many times a second; the strip needs no more than this. */
const LIST_REFRESH_MS = 250;

export const useWorkspaces = defineStore('workspaces', () => {
  const workspaces = ref<WorkspaceSummary[]>([]);
  const currentId = ref<WorkspaceId>();
  const current = computed(() => workspaces.value.find((workspace) => workspace.id === currentId.value));
  let unsubscribe: (() => void) | undefined;

  const agents = useAgents();
  const threads = useThreads();
  const artifacts = useArtifacts();
  const answers = useAnswers();
  const ui = useUi();

  const loadState = (state: WorkspaceState) => {
    agents.load(state.workspace.agents);
    threads.load(state.posts, state.steps);
    artifacts.load(state.artifacts);
    answers.load(state.answers);
  };

  const refreshList = async () => {
    workspaces.value = await api.listWorkspaces();
  };

  let listTimer: ReturnType<typeof setTimeout> | undefined;
  const scheduleListRefresh = () => {
    listTimer ??= setTimeout(() => {
      listTimer = undefined;
      void refreshList().catch(ui.report);
    }, LIST_REFRESH_MS);
  };

  /** Events that arrive while a reload is on its way: the state it returns may be older than they are. */
  const inFlight = new Set<DomainEvent[]>();

  const reload = async (id: WorkspaceId) => {
    const missed: DomainEvent[] = [];
    inFlight.add(missed);
    try {
      const state = await api.workspace(id);
      if (id === currentId.value) {
        loadState(state);
        missed.forEach(dispatch);
      }
    } finally {
      inFlight.delete(missed);
    }
  };

  /** One line per event type: a new event adds one here. */
  const handlers: { [T in DomainEvent['type']]: (event: Extract<DomainEvent, { type: T }>) => void } = {
    'agent.added': (event) => agents.add(event.agent),
    'agent.status': (event) => agents.setStatus(event.agent, event.status),
    'agent.step': (event) => threads.addStep(event.step),
    'post.created': (event) => threads.addPost(event.post),
    'artifact.version': (event) => artifacts.addVersion(event.artifact, event.artifact.versions.at(-1)?.by === agents.current?.id),
    'answers.changed': (event) => answers.set(event.set),
  };
  function dispatch(event: DomainEvent) {
    (handlers[event.type] as (e: DomainEvent) => void)(event);
  }

  const open = async (id: WorkspaceId) => {
    unsubscribe?.();
    currentId.value = id;
    artifacts.reset();
    window.location.hash = `#/w/${id}`;
    unsubscribe = subscribe(id, {
      onEvent(event) {
        for (const missed of inFlight) missed.push(event);
        dispatch(event);
      },
      onConnect: () => void reload(id).catch(ui.report),
      onWorkspacesChanged: scheduleListRefresh,
    });
    await reload(id);
  };

  /** Drums picks the role. Opens the new agent's tab. */
  const addAgent = async (instruction: string) => {
    if (!currentId.value) return;
    const agent = await api.addAgent(currentId.value, instruction);
    agents.add(agent);
    agents.currentId = agent.id;
  };

  const create = async (goal: string) => {
    const state = await api.createWorkspace(goal);
    await refreshList();
    await open(state.workspace.id);
  };

  /** On page load: back to the workspace in the URL, or else the newest. */
  const boot = async () => {
    await refreshList();
    const wanted = /^#\/w\/(.+)$/.exec(window.location.hash)?.[1];
    const first = workspaces.value.find((workspace) => workspace.id === wanted) ?? workspaces.value.at(-1);
    if (first) await open(first.id);
  };

  return { workspaces, currentId, current, refreshList, open, create, addAgent, boot };
});
