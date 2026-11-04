<script setup lang="ts">
import { computed, ref } from 'vue';
import { api } from '../../api/client';
import { useAgents } from '../../stores/agents';
import { useThreads } from '../../stores/threads';
import { useUi } from '../../stores/ui';
import { useWorkspaces } from '../../stores/workspaces';

const workspaces = useWorkspaces();
const agents = useAgents();
const threads = useThreads();
const ui = useUi();
const text = ref('');

const agent = computed(() => agents.current);
const running = computed(() => agent.value?.status === 'running');
const placeholder = computed(() => {
  if (!agent.value) return '';
  return running.value ? `${agent.value.name} is working…` : `Message ${agent.value.name}…`;
});
const working = computed(() => {
  const last = threads.steps.filter((s) => s.agent === agent.value?.id && s.kind === 'tool').at(-1);
  return last?.kind === 'tool' ? `${last.tool} ${last.summary}` : 'Thinking…';
});

const send = async () => {
  const message = text.value.trim();
  if (!message || !agent.value || !workspaces.currentId || running.value) return;
  text.value = '';
  try {
    await api.sendMessage(workspaces.currentId, agent.value.id, message);
  } catch (error) {
    text.value = message;
    ui.report(error);
  }
};

const stop = () => {
  if (workspaces.currentId && agent.value) void api.stop(workspaces.currentId, agent.value.id).catch(ui.report);
};
</script>

<template>
  <form class="composer" @submit.prevent="send">
    <div v-if="running" class="working">
      <span>● {{ working }}</span>
      <button type="button" @click="stop">Stop</button>
    </div>
    <div class="box">
      <textarea
        v-model="text"
        rows="2"
        aria-label="Message"
        :placeholder="placeholder"
        :disabled="!agent"
        @keydown.enter.exact.prevent="send"
      />
      <button class="primary" type="submit" :disabled="!text.trim() || running || !agent">Send</button>
    </div>
  </form>
</template>

<style scoped>
.composer {
  flex: none;
  padding: 10px 12px 12px;
  border-top: 1px solid var(--line);
  background: var(--surface);
}
.working {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  margin: 0 2px 8px;
  font: 12px var(--mono);
  color: var(--accent);
}
.working span {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.working button {
  height: 24px;
  padding: 0 8px;
  border: 1px solid var(--stroke);
  border-radius: 7px;
  background: var(--surface);
  font: 500 12px var(--sans);
  color: var(--ink);
}
.box {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 6px 6px 6px 12px;
  border: 1px solid var(--stroke);
  border-radius: 12px;
  background: var(--bg);
}
.box:focus-within {
  border-color: var(--accent);
}
textarea {
  flex: 1;
  min-height: 40px;
  max-height: 160px;
  padding: 4px 0;
  border: 0;
  outline: none;
  background: none;
  color: inherit;
  font: inherit;
  line-height: 1.45;
  resize: none;
}
.primary {
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--accent);
  border-radius: 10px;
  background: var(--accent);
  color: var(--on-accent);
  font-size: 13.5px;
  font-weight: 500;
}
.primary:disabled {
  opacity: 0.45;
}
</style>
