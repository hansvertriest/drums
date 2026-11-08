import type { AgentId, ArtifactId, CreateWorkspaceRequest, DomainEvent, WorkspaceId, WorkspaceState, WorkspaceSummary } from '@drums/protocol';
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { api } from '../api/client';
import { subscribe } from '../api/live';
import { useAgents } from './agents';
import { useAnswers } from './answers';
import { useArtifacts } from './artifacts';
import { recallTabs, rememberTabs } from './last-tabs';
import { useMap } from './map';
import { useNews } from './news';
import { useThreads } from './threads';
import { useUi } from './ui';

/** A busy workspace changes many times a second; the strip needs no more than this. */
const LIST_REFRESH_MS = 250;
/** The stream reconnects by itself; only say so if that doesn't work out. */
const STREAM_DOWN_MS = 8000;

export const useWorkspaces = defineStore('workspaces', () => {
  const workspaces = ref<WorkspaceSummary[]>([]);
  const currentId = ref<WorkspaceId>();
  const current = computed(() => workspaces.value.find((workspace) => workspace.id === currentId.value));
  let unsubscribe: (() => void) | undefined;

  const agents = useAgents();
  const threads = useThreads();
  const artifacts = useArtifacts();
  const answers = useAnswers();
  const map = useMap();
  const ui = useUi();
  const news = useNews();

  const loadState = (state: WorkspaceState) => {
    agents.load(state.workspace.agents);
    threads.load(state.posts, state.steps, state.workspace.permissions);
    artifacts.load(state.artifacts);
    answers.load(state.answers);
    map.reset();
    if (state.workspace.repos.length > 0) void map.load(state.workspace.id).catch(ui.report);
  };

  /** Counts around the map. Many events can come at once while an agent works. */
  let mapTimer: ReturnType<typeof setTimeout> | undefined;
  const scheduleMapRefresh = () => {
    mapTimer ??= setTimeout(() => {
      mapTimer = undefined;
      if (currentId.value) void map.load(currentId.value).catch(ui.report);
    }, LIST_REFRESH_MS);
  };

  const refreshList = async () => {
    workspaces.value = await api.listWorkspaces();
    news.update(workspaces.value, currentId.value);
  };

  let listTimer: ReturnType<typeof setTimeout> | undefined;
  const scheduleListRefresh = () => {
    listTimer ??= setTimeout(() => {
      listTimer = undefined;
      void refreshList().catch(ui.report);
    }, LIST_REFRESH_MS);
  };

  /** The workspace whose tabs are on screen. Unset while one opens, when the tabs are cleared and then default to the first. */
  let tabsShownFor: WorkspaceId | undefined;

  watch([() => agents.currentId, () => artifacts.currentId], ([agent, artifact]) => {
    if (tabsShownFor !== undefined && tabsShownFor === currentId.value) rememberTabs(tabsShownFor, { agent, artifact });
  });

  /** Once per `open`, so later reloads leave the tabs alone. A saved tab that is gone keeps the default. */
  const restoreTabs = (id: WorkspaceId) => {
    const { agent, artifact } = recallTabs(id);
    if (agents.open.some((a) => a.id === agent)) agents.currentId = agent;
    if (artifacts.shown.some((a) => a.id === artifact)) artifacts.open(artifact!);
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
        if (tabsShownFor !== id) restoreTabs(id);
        tabsShownFor = id;
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
    'agent.closed': (event) => agents.close(event.agent),
    'agent.step': (event) => threads.addStep(event.step),
    'post.created': (event) => {
      if (threads.addPost(event.post) && event.post.kind !== 'message' && event.post.kind !== 'feedback') ui.noteAgentPost();
    },
    'artifact.version': (event) => artifacts.addVersion(event.artifact, event.artifact.versions.at(-1)?.by === agents.current?.id),
    'artifact.archived': (event) => artifacts.replace(event.artifact),
    'answers.changed': (event) => answers.set(event.set),
    'permission.changed': (event) => threads.setPermission(event.request),
    // The frame follows its own session; what happens during a build changes nothing out here.
    'map.changed': (event) => {
      if (event.aspect !== 'status') scheduleMapRefresh();
    },
    'prs.opened': () => scheduleMapRefresh(),
  };
  function dispatch(event: DomainEvent) {
    (handlers[event.type] as (e: DomainEvent) => void)(event);
  }

  let downTimer: ReturnType<typeof setTimeout> | undefined;
  const clearDownTimer = () => {
    clearTimeout(downTimer);
    downTimer = undefined;
  };

  const open = async (id: WorkspaceId) => {
    unsubscribe?.();
    clearDownTimer();
    tabsShownFor = undefined;
    currentId.value = id;
    news.update(workspaces.value, id);
    ui.railNews = false;
    ui.chatNews = false;
    ui.detailsOpen = false;
    artifacts.reset();
    window.location.hash = `#/w/${id}`;
    unsubscribe = subscribe(id, {
      onEvent(event) {
        for (const missed of inFlight) missed.push(event);
        dispatch(event);
      },
      onConnect: () => {
        clearDownTimer();
        ui.offline = false;
        void reload(id).catch(ui.report);
      },
      onDisconnect: () => {
        downTimer ??= setTimeout(() => {
          downTimer = undefined;
          ui.offline = true;
        }, STREAM_DOWN_MS);
      },
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

  const closeAgent = async (id: AgentId) => {
    if (!currentId.value) return;
    await api.closeAgent(currentId.value, id);
    agents.close(id);
  };

  const setArchived = async (archived: boolean) => {
    if (!currentId.value) return;
    await (archived ? api.archive(currentId.value) : api.restore(currentId.value));
    await refreshList();
  };

  const setArtifactArchived = async (id: ArtifactId, archived: boolean) => {
    if (!currentId.value) return;
    artifacts.replace(await api.setArtifactArchived(currentId.value, id, archived));
  };

  const create = async (request: CreateWorkspaceRequest) => {
    const state = await api.createWorkspace(request);
    await refreshList();
    await open(state.workspace.id);
  };

  /** On page load and on trying again: back to the workspace in the URL, or else the newest. */
  const boot = async () => {
    ui.booting = !current.value;
    try {
      try {
        await refreshList();
      } catch {
        ui.offline = true;
        return;
      }
      ui.offline = false;
      const wanted = /^#\/w\/(.+)$/.exec(window.location.hash)?.[1];
      const first = workspaces.value.find((workspace) => workspace.id === wanted) ?? workspaces.value.filter((workspace) => !workspace.archived).at(-1);
      if (first) await open(first.id);
    } finally {
      ui.booting = false;
    }
  };

  return { workspaces, currentId, current, refreshList, open, create, addAgent, closeAgent, setArchived, setArtifactArchived, boot };
});
