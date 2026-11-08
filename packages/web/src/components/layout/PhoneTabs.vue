<script setup lang="ts">
import { useWorkspaceSummary } from '../../composables/useWorkspaceSummary';
import { useUi } from '../../stores/ui';

const ui = useUi();
const { pendingCount } = useWorkspaceSummary();
const TABS = [
  { id: 'chat', label: 'Chat' },
  { id: 'stage', label: 'Artifacts' },
] as const;

const pick = (id: (typeof TABS)[number]['id']) => {
  ui.phoneTab = id;
  if (id === 'chat') ui.chatNews = false;
};
</script>

<template>
  <div class="tabs" role="tablist" aria-label="Chat or artifacts">
    <button v-for="tab in TABS" :key="tab.id" type="button" role="tab" :aria-selected="ui.phoneTab === tab.id" :class="{ on: ui.phoneTab === tab.id }" @click="pick(tab.id)">
      <svg v-if="tab.id === 'chat'" width="20" height="20" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5v6a1.5 1.5 0 0 1-1.5 1.5H8l-3.5 3v-3A1.5 1.5 0 0 1 3 10.5z" /></svg>
      <svg v-else width="20" height="20" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M4 2.5h7l3 3v10H4zM6.5 9h5M6.5 12h5" /></svg>
      {{ tab.label }}
      <b v-if="tab.id === 'chat' && ui.chatNews" class="dot" role="status" aria-label="An agent posted" />
      <span v-if="tab.id === 'stage' && pendingCount > 0" class="count">{{ pendingCount }}</span>
    </button>
  </div>
</template>

<style scoped>
.tabs {
  display: none;
}
@media (max-width: 900px) {
  .tabs {
    flex: none;
    display: flex;
    box-sizing: content-box;
    height: 50px;
    padding: 0 env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px);
    background: var(--surface);
  }
}
button {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  border: 0;
  background: none;
  font-size: 11px;
  color: var(--muted);
}
button.on {
  color: var(--accent);
  font-weight: 500;
}
.dot {
  position: absolute;
  top: 6px;
  left: calc(50% + 10px);
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--mod);
}
.count {
  position: absolute;
  top: 2px;
  left: calc(50% + 9px);
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: var(--mod);
  color: var(--surface);
  font: 600 11px/18px var(--sans);
  text-align: center;
}
</style>
