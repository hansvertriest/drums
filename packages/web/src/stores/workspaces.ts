import type { Workspace, WorkspaceId } from '@drums/protocol';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

export const useWorkspaces = defineStore('workspaces', () => {
  const workspaces = ref<Workspace[]>([]);
  const currentId = ref<WorkspaceId>();
  const current = computed(() => workspaces.value.find((workspace) => workspace.id === currentId.value));
  return { workspaces, currentId, current };
});
