<script setup lang="ts">
import type { Agent } from '@drums/protocol';
import { useAgents } from '../../stores/agents';
import { useUi } from '../../stores/ui';
import { useWorkspaces } from '../../stores/workspaces';
import StatusDot from '../shared/StatusDot.vue';

const agents = useAgents();
const ui = useUi();
const workspaces = useWorkspaces();

const close = (agent: Agent) => {
  if (!window.confirm(`Close ${agent.name}? Its session stops. What it posted and its artifacts stay.`)) return;
  void workspaces.closeAgent(agent.id).catch(ui.report);
};
</script>

<template>
  <div class="head">
    <div class="tabs" role="tablist">
      <span v-for="agent in agents.open" :key="agent.id" class="tab" :class="{ on: agent.id === agents.current?.id }">
        <button type="button" role="tab" :aria-selected="agent.id === agents.current?.id" @click="agents.currentId = agent.id">
          <StatusDot class="small" :status="agent.status" />{{ agent.name }}
        </button>
        <button type="button" class="close" :aria-label="`Close ${agent.name}`" title="Close agent" @click="close(agent)">×</button>
      </span>
      <button type="button" class="add" aria-label="Add agent" title="Add agent" @click="ui.addAgentOpen = true">+</button>
    </div>
    <button type="button" class="icon-button steps" aria-label="Steps" title="Steps" :aria-pressed="ui.showSteps" @click="ui.showSteps = !ui.showSteps">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M3 4h2M3 8h2M3 12h2M7.5 4H13M7.5 8H13M7.5 12H13" /></svg>
    </button>
  </div>
</template>

<style scoped>
.head {
  display: flex;
  flex: none;
  align-items: center;
  gap: 2px;
  height: 40px;
  padding: 0 8px;
}
@media (max-width: 900px) {
  .head {
    height: 42px;
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
  justify-content: center;
  width: 30px;
  margin-left: -8px;
  padding: 0;
  font-size: 14px;
  font-weight: 400;
  color: var(--muted);
  visibility: hidden;
}
.tab.on .close,
.close:focus-visible {
  visibility: visible;
}
@media (hover: hover) {
  .tab:hover .close {
    visibility: visible;
  }
  .tabs .tab .close:hover {
    background: var(--line);
    color: var(--ink);
  }
}
.tabs .add {
  padding: 0 9px;
  font-size: 17px;
}
.small {
  width: 7px;
  height: 7px;
}
</style>
