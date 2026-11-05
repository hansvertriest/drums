import type { WorkspaceId, WorkspaceSummary } from '@drums/protocol';
import { defineStore } from 'pinia';
import { ref } from 'vue';

const STORAGE_KEY = 'drums.seen';

const load = (): Record<WorkspaceId, number> => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<WorkspaceId, number>) : {};
  } catch {
    return {};
  }
};

/** What the blue dot on the strip needs: how far in each workspace's feed you have looked. Kept per browser. */
export const useNews = defineStore('news', () => {
  const seen = ref(load());

  const save = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seen.value));
    } catch {
      /* Only the dots are at stake. */
    }
  };

  return {
    /** A new list arrived. A workspace you never saw starts from where it is now; the open one is always seen. */
    update(workspaces: readonly WorkspaceSummary[], open: WorkspaceId | undefined) {
      for (const { id, lastPost = 0 } of workspaces) {
        if (id === open || seen.value[id] === undefined) seen.value[id] = lastPost;
      }
      save();
    },
    hasNews: ({ id, lastPost = 0 }: WorkspaceSummary) => lastPost > (seen.value[id] ?? lastPost),
  };
});
