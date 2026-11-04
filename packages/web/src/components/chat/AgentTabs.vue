<script setup lang="ts">
import { useAgents } from '../../stores/agents';
import { useUi } from '../../stores/ui';

const agents = useAgents();
const ui = useUi();
</script>

<template>
  <div class="head">
    <div class="tabs" role="tablist">
      <button
        v-for="agent in agents.agents"
        :key="agent.id"
        type="button"
        role="tab"
        :aria-selected="agent.id === agents.current?.id"
        :class="{ on: agent.id === agents.current?.id }"
        @click="agents.currentId = agent.id"
      >
        <i :class="`st-${agent.status}`" />{{ agent.name }}
      </button>
    </div>
    <button type="button" class="steps" :aria-pressed="ui.showSteps" @click="ui.showSteps = !ui.showSteps">Steps</button>
  </div>
</template>

<style scoped>
.head {
  display: flex;
  flex: none;
  align-items: center;
  gap: 2px;
  padding: 8px 8px 6px;
  border-bottom: 1px solid var(--line);
}
.tabs {
  flex: 1;
  min-width: 0;
  display: flex;
  gap: 2px;
  overflow-x: auto;
  scrollbar-width: none;
}
.tabs button {
  flex: none;
  display: inline-flex;
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
.tabs button.on {
  background: var(--surface-2);
  color: var(--ink);
  font-weight: 500;
}
i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--line);
}
i.st-running {
  background: var(--accent);
  animation: pulse 1.2s ease-in-out infinite;
}
i.st-input {
  background: var(--mod);
}
i.st-review {
  background: var(--add);
}
.steps {
  flex: none;
  height: 30px;
  padding: 0 10px;
  border: 0;
  border-radius: 8px;
  background: none;
  font-size: 12.5px;
  color: var(--muted);
}
.steps[aria-pressed='true'] {
  background: var(--accent-soft);
  color: var(--accent);
}
@keyframes pulse {
  50% {
    opacity: 0.25;
  }
}
@media (prefers-reduced-motion: reduce) {
  i.st-running {
    animation: none;
  }
}
</style>
