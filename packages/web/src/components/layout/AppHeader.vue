<script setup lang="ts">
import { computed } from 'vue';
import { useAgents } from '../../stores/agents';
import { useAnswers } from '../../stores/answers';
import { useUi } from '../../stores/ui';
import { useWorkspaces } from '../../stores/workspaces';
import SendPopover from '../dialogs/SendPopover.vue';

const STATUS_LABEL: Record<string, string> = {
  input: 'Needs input',
  review: 'Ready for review',
  running: 'Running',
  idle: 'Idle',
};

const workspaces = useWorkspaces();
const agents = useAgents();
const answers = useAnswers();
const ui = useUi();

const subline = computed(() => {
  if (!workspaces.current) return 'No workspace';
  const count = agents.agents.length;
  return `${count} agent${count === 1 ? '' : 's'}`;
});
const status = computed(() => workspaces.current?.status);
</script>

<template>
  <header class="header">
    <span class="logo-cell">
      <span class="logo" role="img" aria-label="drums">d</span>
    </span>
    <div class="title">
      <h1>{{ workspaces.current?.goal ?? 'drums' }}</h1>
      <p>{{ subline }}</p>
    </div>
    <span v-if="status" class="pill" :class="`st-${status}`"><i />{{ STATUS_LABEL[status] }}</span>
    <div class="send-wrap">
      <button
        class="send"
        :class="{ primary: answers.pendingCount > 0 }"
        type="button"
        :disabled="!workspaces.current"
        :aria-expanded="ui.sendOpen"
        @click="ui.sendOpen = !ui.sendOpen"
      >
        Send <span class="count">{{ answers.pendingCount }}</span>
      </button>
      <SendPopover v-if="ui.sendOpen" />
    </div>
  </header>
</template>

<style scoped>
.header {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: none;
  height: 60px;
  padding-right: 20px;
  background: var(--surface);
  border-bottom: 1px solid var(--line);
}
.logo-cell {
  flex: none;
  align-self: stretch;
  width: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-right: 1px solid var(--line);
}
.logo {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--ink);
  color: var(--bg);
  display: flex;
  align-items: center;
  justify-content: center;
  font: 600 16px var(--mono);
}
.title {
  flex: 1;
  min-width: 0;
}
.title h1 {
  margin: 0;
  overflow: hidden;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.title p {
  margin: 2px 0 0;
  font-size: 12.5px;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font: 500 12.5px var(--sans);
  color: var(--muted);
  white-space: nowrap;
}
.pill i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--line);
}
.st-running i {
  background: var(--accent);
}
.st-input {
  color: var(--mod);
}
.st-input i {
  background: var(--mod);
}
.st-review i {
  background: var(--add);
}
.send-wrap {
  position: relative;
}
.send {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 36px;
  padding: 0 12px;
  border: 1px solid var(--stroke);
  border-radius: 10px;
  background: var(--surface);
  font-weight: 500;
}
.send.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent);
}
.send:disabled {
  opacity: 0.45;
}
.count {
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--muted);
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.send.primary .count {
  background: var(--on-accent);
  color: var(--accent);
}
</style>
