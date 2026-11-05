import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useUi = defineStore('ui', () => {
  const showSteps = ref(false);
  const showChanges = ref(true);
  const newWorkspaceOpen = ref(false);
  const addAgentOpen = ref(false);
  const sendOpen = ref(false);
  const openPrsOpen = ref(false);
  /** A refusal or failure to show the user. */
  const error = ref<string>();

  const report = (cause: unknown) => {
    error.value = cause instanceof Error ? cause.message : String(cause);
  };

  return { showSteps, showChanges, newWorkspaceOpen, addAgentOpen, sendOpen, openPrsOpen, error, report };
});
