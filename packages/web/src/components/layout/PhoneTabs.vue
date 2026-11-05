<script setup lang="ts">
import { useUi } from '../../stores/ui';

const ui = useUi();
const TABS = [
  { id: 'chat', label: 'Chat' },
  { id: 'stage', label: 'Artifacts' },
] as const;
</script>

<template>
  <div class="tabs" role="tablist" aria-label="Chat or artifacts">
    <button v-for="tab in TABS" :key="tab.id" type="button" role="tab" :aria-selected="ui.phoneTab === tab.id" :class="{ on: ui.phoneTab === tab.id }" @click="ui.phoneTab = tab.id">
      {{ tab.label }}
    </button>
  </div>
</template>

<style scoped>
.tabs {
  display: none;
}
@media (max-width: 900px) {
  .tabs {
    display: flex;
    flex: none;
    gap: 4px;
    padding: 8px 16px;
    background: var(--surface);
    border-bottom: 1px solid var(--line);
  }
  button {
    flex: 1;
    height: 34px;
    border: 1px solid var(--line);
    border-radius: 9px;
    background: none;
    font-size: 13px;
    font-weight: 500;
  }
  button.on {
    background: var(--accent-soft);
    border-color: var(--accent);
    color: var(--accent);
  }
}
</style>
