<script setup lang="ts">
import { computed, ref } from 'vue';
import { api } from '../../api/client';
import { usePastedImages } from '../../composables/usePastedImages';
import { useAgents } from '../../stores/agents';
import { useFocus } from '../../stores/focus';
import { useThreads } from '../../stores/threads';
import { useUi } from '../../stores/ui';
import { useWorkspaces } from '../../stores/workspaces';
import FocusChip from './FocusChip.vue';

const workspaces = useWorkspaces();
const agents = useAgents();
const threads = useThreads();
const focus = useFocus();
const ui = useUi();
const text = ref('');
const { images, paste, remove, take } = usePastedImages((message) => ui.report(message));

const agent = computed(() => agents.current);
const running = computed(() => agent.value?.status === 'running');
/** Its turn waits on an allow or a deny: nothing can be sent, but it can be stopped. */
const asking = computed(() => threads.permissions.some((request) => request.agent === agent.value?.id && request.status === 'pending'));
const busy = computed(() => running.value || asking.value);
const placeholder = computed(() => {
  if (!agent.value) return '';
  if (asking.value) return `${agent.value.name} is waiting for your answer above`;
  return running.value ? `${agent.value.name} is working…` : `Message ${agent.value.name}…`;
});
const working = computed(() => {
  const last = threads.steps.filter((s) => s.agent === agent.value?.id && s.kind === 'tool').at(-1);
  return last?.kind === 'tool' ? `${last.tool} ${last.summary}` : 'Thinking…';
});

const canSend = computed(() => (text.value.trim() !== '' || images.value.length > 0) && !busy.value && !!agent.value);

const send = async () => {
  const message = text.value.trim();
  if (!canSend.value || !workspaces.currentId) return;
  const { upload, restore } = take();
  text.value = '';
  try {
    await api.sendMessage(workspaces.currentId, agent.value!.id, message, focus.focus, upload);
  } catch (error) {
    text.value = message;
    restore();
    ui.report(error);
  }
};

const stop = () => {
  if (workspaces.currentId && agent.value) void api.stop(workspaces.currentId, agent.value.id).catch(ui.report);
};
</script>

<template>
  <form class="composer" @submit.prevent="send">
    <div v-if="busy" class="working">
      <span>● {{ asking ? 'Waiting for your answer' : working }}</span>
      <button type="button" @click="stop">Stop</button>
    </div>
    <FocusChip />
    <div v-if="images.length > 0" class="images">
      <span v-for="(image, i) in images" :key="image.id" class="image">
        <img :src="image.url" alt="Pasted image" />
        <button type="button" :aria-label="`Remove image ${i + 1}`" @click="remove(image.id)">×</button>
      </span>
    </div>
    <div class="box">
      <textarea
        v-model="text"
        rows="2"
        aria-label="Message"
        :placeholder="placeholder"
        :disabled="!agent"
        @keydown.enter.exact.prevent="send"
        @paste="paste"
      />
      <button class="primary" type="submit" :disabled="!canSend">Send</button>
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
.images {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0 2px 8px;
}
.image {
  position: relative;
}
.image img {
  display: block;
  width: 56px;
  height: 56px;
  border: 1px solid var(--line);
  border-radius: 8px;
  object-fit: cover;
}
.image button {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 50%;
  background: var(--surface);
  font-size: 12px;
  line-height: 1;
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
