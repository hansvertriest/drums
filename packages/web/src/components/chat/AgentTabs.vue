<script setup lang="ts">
import type { Agent } from '@drums/protocol';
import { ref, watch } from 'vue';
import { useAgents } from '../../stores/agents';
import { useUi } from '../../stores/ui';
import { useWorkspaces } from '../../stores/workspaces';

const agents = useAgents();
const ui = useUi();
const workspaces = useWorkspaces();
const collapse = ref<HTMLButtonElement>();

const close = (agent: Agent) => {
  if (!window.confirm(`Close ${agent.name}? Its session stops. What it posted and its artifacts stay.`)) return;
  void workspaces.closeAgent(agent.id).catch(ui.report);
};

/** Back from the floating button: the keyboard stays where it was. */
watch(
  () => ui.railCollapsed,
  (collapsed) => {
    if (!collapsed) collapse.value?.focus({ preventScroll: true });
  },
  { flush: 'post' },
);
</script>

<template>
  <div class="head">
    <button ref="collapse" type="button" class="collapse" aria-label="Collapse chat" title="Collapse chat (\)" @click="ui.toggleRail()">«</button>
    <div class="tabs" role="tablist">
      <span v-for="agent in agents.open" :key="agent.id" class="tab" :class="{ on: agent.id === agents.current?.id }">
        <button type="button" role="tab" :aria-selected="agent.id === agents.current?.id" @click="agents.currentId = agent.id">
          <i :class="`st-${agent.status}`" />{{ agent.name }}
        </button>
        <button type="button" class="close" :aria-label="`Close ${agent.name}`" title="Close agent" @click="close(agent)">×</button>
      </span>
      <button type="button" class="add" aria-label="Add agent" title="Add agent" @click="ui.addAgentOpen = true">+</button>
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
.collapse {
  flex: none;
  width: 28px;
  height: 30px;
  border: 0;
  border-radius: 8px;
  background: none;
  font-size: 15px;
  color: var(--muted);
}
.collapse:hover {
  background: var(--surface-2);
}
@media (max-width: 900px) {
  .collapse {
    display: none;
  }
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
.tab {
  flex: none;
  display: inline-flex;
  align-items: center;
  border-radius: 8px;
}
.tab.on {
  background: var(--surface-2);
}
.tab.on button {
  color: var(--ink);
  font-weight: 500;
}
.tabs .tab .close {
  height: 22px;
  margin-left: -8px;
  padding: 0 5px;
  border-radius: 5px;
  font-size: 14px;
  font-weight: 400;
  color: var(--muted);
  visibility: hidden;
}
.tab:hover .close,
.tab.on .close,
.close:focus-visible {
  visibility: visible;
}
.tabs .tab .close:hover {
  background: var(--line);
  color: var(--ink);
}
@media (hover: none) {
  .tabs .tab .close {
    visibility: visible;
  }
}
.tabs .add {
  padding: 0 9px;
  font-size: 17px;
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
