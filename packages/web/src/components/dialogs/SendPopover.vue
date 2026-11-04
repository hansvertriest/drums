<script setup lang="ts">
import { computed, ref } from 'vue';
import { api } from '../../api/client';
import { useAgents } from '../../stores/agents';
import { useAnswers } from '../../stores/answers';
import { useArtifacts } from '../../stores/artifacts';
import { useUi } from '../../stores/ui';
import { useWorkspaces } from '../../stores/workspaces';

const workspaces = useWorkspaces();
const artifacts = useArtifacts();
const agents = useAgents();
const answers = useAnswers();
const ui = useUi();
const overall = ref('');
const sending = ref(false);

const groups = computed(() =>
  artifacts.artifacts
    .map((artifact) => ({ artifact, latest: artifact.versions.at(-1), pending: answers.pendingFor(artifact.id) }))
    .filter(({ pending }) => pending.length > 0),
);
const canSend = computed(() => !sending.value && (groups.value.length > 0 || overall.value.trim().length > 0));

const send = async () => {
  if (!workspaces.currentId || !canSend.value) return;
  sending.value = true;
  try {
    await api.send(workspaces.currentId, overall.value.trim() || undefined);
    overall.value = '';
    ui.sendOpen = false;
  } catch (error) {
    ui.report(error);
  } finally {
    sending.value = false;
  }
};
</script>

<template>
  <div class="pop" role="dialog" aria-label="Send">
    <h4>Send</h4>
    <template v-for="{ artifact, latest, pending } in groups" :key="artifact.id">
      <h5>{{ artifact.title }} v{{ latest?.version }} → {{ latest && agents.nameOf(latest.by) }}</h5>
      <div v-for="answer in pending" :key="answer.name" class="answer">
        <span>{{ answer.label }}</span><b>{{ answer.value.slice(0, 120) }}</b>
      </div>
    </template>
    <p v-if="groups.length === 0" class="hint">Nothing changed yet.</p>
    <textarea v-model="overall" aria-label="Overall note" placeholder="Anything else…" />
    <div class="acts">
      <button type="button" @click="ui.sendOpen = false">Close</button>
      <button class="primary" type="button" :disabled="!canSend" @click="send">Send</button>
    </div>
  </div>
</template>

<style scoped>
.pop {
  position: absolute;
  z-index: 40;
  top: calc(100% + 8px);
  right: 0;
  width: 360px;
  max-height: 70vh;
  padding: 14px;
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
  box-shadow: 0 10px 32px var(--shadow);
}
h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}
h5 {
  margin: 10px 0 4px;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--muted);
}
.answer {
  display: grid;
  gap: 1px;
  padding: 4px 0;
  font-size: 13px;
  overflow-wrap: anywhere;
}
.answer span {
  color: var(--muted);
}
.answer b {
  font-weight: 500;
}
.hint {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--muted);
}
textarea {
  width: 100%;
  min-height: 70px;
  margin-top: 12px;
  padding: 6px 8px;
  border: 1px solid var(--stroke);
  border-radius: 8px;
  background: var(--bg);
  color: inherit;
  font: inherit;
  resize: vertical;
}
.acts {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 10px;
}
.acts button {
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--stroke);
  border-radius: 10px;
  background: var(--surface);
  font-size: 13px;
  font-weight: 500;
}
.acts .primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent);
}
.acts .primary:disabled {
  opacity: 0.45;
}
</style>
