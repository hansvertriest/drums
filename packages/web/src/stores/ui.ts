import { defineStore } from 'pinia';
import { ref } from 'vue';

const RAIL_KEY = 'drums.rail';

const storedRailCollapsed = () => {
  try {
    return localStorage.getItem(RAIL_KEY) === 'collapsed';
  } catch {
    return false;
  }
};

export const useUi = defineStore('ui', () => {
  const showSteps = ref(false);
  const showChanges = ref(true);
  const newWorkspaceOpen = ref(false);
  const addAgentOpen = ref(false);
  const sendOpen = ref(false);
  const openPrsOpen = ref(false);
  /** A refusal or failure to show the user. */
  const error = ref<string>();

  /** The chat rail is folded into a floating button. Remembered per browser. */
  const railCollapsed = ref(storedRailCollapsed());
  /** An agent posted while it was folded. */
  const railNews = ref(false);
  /** Phones: the workspaces drawer, and which of the two tabs shows. */
  const drawerOpen = ref(false);
  const phoneTab = ref<'chat' | 'stage'>('chat');

  const report = (cause: unknown) => {
    error.value = cause instanceof Error ? cause.message : String(cause);
  };

  const toggleRail = () => {
    railCollapsed.value = !railCollapsed.value;
    if (!railCollapsed.value) railNews.value = false;
    try {
      localStorage.setItem(RAIL_KEY, railCollapsed.value ? 'collapsed' : 'open');
    } catch {
      /* It just won't be remembered. */
    }
  };

  const noteAgentPost = () => {
    if (railCollapsed.value) railNews.value = true;
  };

  return { showSteps, showChanges, newWorkspaceOpen, addAgentOpen, sendOpen, openPrsOpen, error, railCollapsed, railNews, drawerOpen, phoneTab, report, toggleRail, noteAgentPost };
});
