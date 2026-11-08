<script setup lang="ts">
import type { Artifact } from '@drums/protocol';
import { computed, ref } from 'vue';
import { rendererFor } from '../../renderers';
import { useAnswers } from '../../stores/answers';
import { useArtifacts } from '../../stores/artifacts';
import { useUi } from '../../stores/ui';
import { useWorkspaces } from '../../stores/workspaces';

const MENU_WIDTH = 300;

const artifacts = useArtifacts();
const answers = useAnswers();
const workspaces = useWorkspaces();
const ui = useUi();
const showArchived = ref(false);
const archivedCount = computed(() => artifacts.artifacts.length - artifacts.shown.length);

const setArchived = (artifact: Artifact, archived: boolean) => void workspaces.setArtifactArchived(artifact.id, archived).catch(ui.report);

const isCurrent = (artifact: Artifact) => artifact.id === artifacts.currentId;
const hasPicker = (artifact: Artifact) => artifact.versions.length > 0 && !rendererFor(artifact.renderer)?.ownVersions;
const shownVersion = (artifact: Artifact) => (isCurrent(artifact) ? artifacts.viewing : artifact.versions.at(-1)?.version);

/** A tab opens its artifact; the tab that is already open lists its versions. */
const select = (artifact: Artifact, event: MouseEvent) => {
  if (!isCurrent(artifact)) {
    artifacts.open(artifact.id);
    return;
  }
  if (!hasPicker(artifact)) return;
  if (ui.versionsAt) {
    ui.versionsAt = undefined;
    return;
  }
  const tab = (event.currentTarget as HTMLElement).getBoundingClientRect();
  ui.versionsAt = { left: Math.max(8, Math.min(tab.left, window.innerWidth - MENU_WIDTH - 8)), top: tab.bottom + 6 };
};
</script>

<template>
  <div class="tabs" role="tablist">
    <span v-for="artifact in showArchived ? artifacts.artifacts : artifacts.shown" :key="artifact.id" class="tab" :class="{ on: isCurrent(artifact), archived: artifact.archived }">
      <button
        type="button"
        role="tab"
        :aria-selected="isCurrent(artifact)"
        :aria-haspopup="isCurrent(artifact) && hasPicker(artifact) ? 'dialog' : undefined"
        :aria-expanded="isCurrent(artifact) && hasPicker(artifact) ? ui.versionsAt !== undefined : undefined"
        :data-version-trigger="isCurrent(artifact) && hasPicker(artifact) ? '' : undefined"
        @click="select(artifact, $event)"
      >
        {{ artifact.title }}
        <span v-if="hasPicker(artifact)" class="version" :class="{ open: isCurrent(artifact) }">v{{ shownVersion(artifact) }}</span>
        <span v-if="answers.pendingFor(artifact.id).length" class="count">{{ answers.pendingFor(artifact.id).length }}</span>
      </button>
      <button
        v-if="artifact.archived"
        type="button"
        class="action"
        :aria-label="`Restore ${artifact.title}`"
        title="Restore artifact"
        @click="setArchived(artifact, false)"
      >
        ↺
      </button>
      <button v-else type="button" class="action" :aria-label="`Archive ${artifact.title}`" title="Archive artifact" @click="setArchived(artifact, true)">×</button>
    </span>
    <button v-if="archivedCount > 0" type="button" class="toggle" :aria-expanded="showArchived" @click="showArchived = !showArchived">
      {{ showArchived ? 'Hide archived' : `Archived (${archivedCount})` }}
    </button>
  </div>
</template>

<style scoped>
.tabs {
  flex: 0 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 2px;
  overflow-x: auto;
  scrollbar-width: none;
}
.tab {
  flex: none;
  display: flex;
  align-items: center;
  border-radius: 8px;
}
.tab.on {
  background: var(--surface-2);
}
.tab.archived {
  opacity: 0.6;
}
button {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 10px;
  border: 0;
  border-radius: 8px;
  background: none;
  font-size: 13px;
  color: var(--muted);
  white-space: nowrap;
}
.tab.on button {
  color: var(--ink);
  font-weight: 500;
}
.tab .action {
  justify-content: center;
  width: 30px;
  margin-left: -8px;
  padding: 0;
  font-size: 14px;
  font-weight: 400;
  color: var(--muted);
  visibility: hidden;
}
.tab.on .action,
.tab.archived .action,
.action:focus-visible {
  visibility: visible;
}
@media (hover: hover) {
  .tab:hover .action {
    visibility: visible;
  }
  .tab .action:hover {
    background: var(--line);
    color: var(--ink);
  }
}
.toggle {
  font-size: 12.5px;
}
.version {
  font: 11.5px var(--mono);
  color: var(--muted);
}
/* Not in the text, so a screen reader says the version and not a triangle. */
.version.open::after {
  content: ' ▾';
}
.count {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--mod);
  color: var(--surface);
  font: 600 11px var(--sans);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
</style>
