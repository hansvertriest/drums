<script setup lang="ts">
import { artifactDocument, artifactSandbox } from '@drums/artifact-kit';
import { parseFrameMessage, type Answer, type HostMessage } from '@drums/protocol';
import { computed, onBeforeUnmount, onMounted, ref, toRaw, watch } from 'vue';

const props = defineProps<{ content: string; answers: Answer[]; readOnly: boolean; changes: boolean }>();
const emit = defineEmits<{ answers: [answers: Answer[]] }>();

const frame = ref<HTMLIFrameElement>();
const doc = computed(() => artifactDocument(props.content));

/** The frame's origin is opaque, so `*` is the only target there is; nothing secret goes in. */
const post = (message: HostMessage) => frame.value?.contentWindow?.postMessage(message, '*');

const onMessage = (event: MessageEvent) => {
  // The frame runs agent-written code: only that one window, and only well-formed messages.
  if (!frame.value || event.source !== frame.value.contentWindow) return;
  const message = parseFrameMessage(event.data);
  if (message?.type === 'ready') {
    post({
      source: 'drums-host',
      type: 'init',
      answers: toRaw(props.answers).map((answer) => ({ ...answer })),
      readOnly: props.readOnly,
      changes: props.changes,
    });
  } else if (message?.type === 'answers' && !props.readOnly) {
    emit('answers', message.answers);
  }
};

onMounted(() => window.addEventListener('message', onMessage));
onBeforeUnmount(() => window.removeEventListener('message', onMessage));
watch(
  () => props.changes,
  (on) => post({ source: 'drums-host', type: 'changes', on }),
);
</script>

<template>
  <iframe ref="frame" class="frame" title="Artifact" :sandbox="artifactSandbox" :srcdoc="doc" />
</template>

<style scoped>
.frame {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
  background: var(--bg);
}
</style>
