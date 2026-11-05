<script setup lang="ts">
import type { Artifact } from '@drums/protocol';
import { computed, ref } from 'vue';
import { useAnswers } from '../../stores/answers';
import { useArtifacts } from '../../stores/artifacts';
import { useUi } from '../../stores/ui';
import { useWorkspaces } from '../../stores/workspaces';

const artifacts = useArtifacts();
const answers = useAnswers();
const workspaces = useWorkspaces();
const ui = useUi();
const showArchived = ref(false);
const archivedCount = computed(() => artifacts.artifacts.length - artifacts.shown.length);

const setArchived = (artifact: Artifact, archived: boolean) => void workspaces.setArtifactArchived(artifact.id, archived).catch(ui.report);
</script>

<template>
  <div class="tabs" role="tablist">
    <span
      v-for="artifact in showArchived ? artifacts.artifacts : artifacts.shown"
      :key="artifact.id"
      class="tab"
      :class="{ on: artifact.id === artifacts.currentId, archived: artifact.archived }"
    >
      <button type="button" role="tab" :aria-selected="artifact.id === artifacts.currentId" @click="artifacts.open(artifact.id)">
        {{ artifact.title }}
        <span v-if="artifact.versions.length > 0" class="version">v{{ artifact.versions.at(-1)?.version }}</span>
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
  display: flex;
  gap: 4px;
  flex: none;
  padding: 8px 16px 0;
  overflow-x: auto;
  border-bottom: 1px solid var(--line);
  background: var(--surface);
  scrollbar-width: none;
}
.tab {
  flex: none;
  display: flex;
  align-items: center;
  margin-bottom: -1px;
  border: 1px solid transparent;
  border-bottom: 0;
  border-radius: 10px 10px 0 0;
}
.tab.on {
  background: var(--bg);
  border-color: var(--line);
}
.tab.archived {
  opacity: 0.6;
}
button {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 12px;
  border: 0;
  background: none;
  font-size: 13px;
  color: var(--muted);
}
.tab.on button {
  color: var(--ink);
  font-weight: 500;
}
.tab .action {
  height: 22px;
  margin: 0 6px 0 -8px;
  padding: 0 5px;
  border-radius: 5px;
  font-size: 14px;
  font-weight: 400;
  color: var(--muted);
  visibility: hidden;
}
.tab:hover .action,
.tab.on .action,
.tab.archived .action,
.action:focus-visible {
  visibility: visible;
}
.tab .action:hover {
  background: var(--line);
  color: var(--ink);
}
@media (hover: none) {
  .tab .action {
    visibility: visible;
  }
}
.toggle {
  font-size: 12.5px;
}
.version {
  font: 11.5px var(--mono);
  color: var(--muted);
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
