import { defineStore } from 'pinia';
import { ref } from 'vue';

const RAIL_KEY = 'drums.rail';
const RAIL_WIDTH_KEY = 'drums.rail-width';
export const RAIL_WIDTH = { default: 360, min: 280, max: 900 };

const stored = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const remember = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* It just won't be remembered. */
  }
};

const clampRailWidth = (width: number) =>
  Math.round(Math.min(Math.max(width, RAIL_WIDTH.min), RAIL_WIDTH.max, Math.max(RAIL_WIDTH.min, window.innerWidth * 0.7)));

export const useUi = defineStore('ui', () => {
  const showSteps = ref(false);
  const showChanges = ref(true);
  const newWorkspaceOpen = ref(false);
  const addAgentOpen = ref(false);
  const sendOpen = ref(false);
  /** A refusal or failure to show the user. */
  const error = ref<string>();

  /** The chat rail is folded into a floating button. Remembered per browser. */
  const railCollapsed = ref(stored(RAIL_KEY) === 'collapsed');
  /** Dragged by its edge. Remembered per browser. */
  const railWidth = ref(clampRailWidth(Number(stored(RAIL_WIDTH_KEY)) || RAIL_WIDTH.default));
  /** An agent posted while it was folded. */
  const railNews = ref(false);
  /** Phones: the workspaces drawer, and which of the two tabs shows. */
  const drawerOpen = ref(false);
  const phoneTab = ref<'chat' | 'stage'>('chat');
  /** Phones: an agent posted while the artifacts tab was open. */
  const chatNews = ref(false);
  /** Phones: the height left above the keyboard, while it is up. */
  const keyboardHeight = ref<number>();
  /** The workspace's status, branch, repos and archive button. */
  const detailsOpen = ref(false);
  /** Where the list of versions opens, while it is open. */
  const versionsAt = ref<{ left: number; top: number }>();
  /** The first load is on its way. */
  const booting = ref(false);
  /** The server doesn't answer: an installed app has no address bar to reload from. */
  const offline = ref(false);

  const report = (cause: unknown) => {
    error.value = cause instanceof Error ? cause.message : String(cause);
  };

  const toggleRail = () => {
    railCollapsed.value = !railCollapsed.value;
    if (!railCollapsed.value) railNews.value = false;
    remember(RAIL_KEY, railCollapsed.value ? 'collapsed' : 'open');
  };

  const setRailWidth = (width: number) => {
    railWidth.value = clampRailWidth(width);
    remember(RAIL_WIDTH_KEY, String(railWidth.value));
  };

  const noteAgentPost = () => {
    if (railCollapsed.value) railNews.value = true;
    if (phoneTab.value === 'stage') chatNews.value = true;
  };

  return {
    showSteps,
    showChanges,
    newWorkspaceOpen,
    addAgentOpen,
    sendOpen,
    error,
    railCollapsed,
    railWidth,
    railNews,
    drawerOpen,
    phoneTab,
    chatNews,
    keyboardHeight,
    detailsOpen,
    versionsAt,
    booting,
    offline,
    report,
    toggleRail,
    setRailWidth,
    noteAgentPost,
  };
});
