import type { AgentId, MapState, RepoName, WorkspaceId } from '@drums/protocol';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { api } from '../api/client';

type MapRepo = MapState['repos'][number];

/** The repos around the map: which frames there are, and their counts. Dyffle's own page does the rest. */
export const useMap = defineStore('map', () => {
  const repos = ref<MapRepo[]>([]);
  const branch = ref<string>();
  const shown = ref<RepoName>();
  const commentsTo = ref<AgentId>();

  const current = computed(() => repos.value.find((repo) => repo.name === shown.value) ?? repos.value[0]);
  const pendingComments = computed(() => repos.value.reduce((total, repo) => total + repo.pendingComments, 0));

  const load = async (workspace: WorkspaceId) => {
    const state = await api.map(workspace);
    repos.value = state.repos;
    branch.value = state.branch;
    commentsTo.value = state.commentsTo;
  };

  const reset = () => {
    repos.value = [];
    branch.value = undefined;
    shown.value = undefined;
    commentsTo.value = undefined;
  };

  return { repos, branch, shown, commentsTo, current, pendingComments, load, reset };
});
