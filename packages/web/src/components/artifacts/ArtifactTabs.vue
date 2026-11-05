<script setup lang="ts">
import { useAnswers } from '../../stores/answers';
import { useArtifacts } from '../../stores/artifacts';

const artifacts = useArtifacts();
const answers = useAnswers();
</script>

<template>
  <div class="tabs" role="tablist">
    <button
      v-for="artifact in artifacts.artifacts"
      :key="artifact.id"
      type="button"
      role="tab"
      :aria-selected="artifact.id === artifacts.currentId"
      :class="{ on: artifact.id === artifacts.currentId }"
      @click="artifacts.open(artifact.id)"
    >
      {{ artifact.title }}
      <span v-if="artifact.versions.length > 0" class="version">v{{ artifact.versions.at(-1)?.version }}</span>
      <span v-if="answers.pendingFor(artifact.id).length" class="count">{{ answers.pendingFor(artifact.id).length }}</span>
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
button {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 12px;
  margin-bottom: -1px;
  border: 1px solid transparent;
  border-bottom: 0;
  border-radius: 10px 10px 0 0;
  background: none;
  font-size: 13px;
  color: var(--muted);
}
button.on {
  background: var(--bg);
  border-color: var(--line);
  color: var(--ink);
  font-weight: 500;
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
