<script setup lang="ts">
import type { PermissionDecision, PermissionRequest } from '@drums/protocol';
import { ref } from 'vue';
import { api } from '../../api/client';
import { useUi } from '../../stores/ui';
import { useWorkspaces } from '../../stores/workspaces';

const props = defineProps<{ request: PermissionRequest }>();

const OUTCOME: Record<string, string> = { allowed: 'Allowed', denied: 'Denied', expired: 'No longer waiting' };

const workspaces = useWorkspaces();
const ui = useUi();
const answering = ref(false);

const answer = async (decision: PermissionDecision) => {
  if (!workspaces.currentId || answering.value) return;
  answering.value = true;
  try {
    await api.answerPermission(workspaces.currentId, props.request.agent, props.request.id, decision);
  } catch (error) {
    ui.report(error);
  } finally {
    answering.value = false;
  }
};
</script>

<template>
  <div class="row" :class="{ pending: request.status === 'pending' }">
    <p class="title">{{ request.title }}</p>
    <code>{{ request.detail }}</code>
    <div v-if="request.status === 'pending'" class="acts">
      <button type="button" :disabled="answering" @click="answer('deny')">Deny</button>
      <button type="button" class="allow" :disabled="answering" @click="answer('allow')">Allow</button>
    </div>
    <p v-else class="outcome">{{ OUTCOME[request.status] }}</p>
  </div>
</template>

<style scoped>
.row {
  padding: 9px 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--bg);
  font-size: 13px;
  overflow-wrap: anywhere;
}
.row.pending {
  border-color: var(--mod);
  background: var(--mod-bg);
}
.title {
  margin: 0 0 4px;
  font-weight: 500;
}
code {
  display: block;
  max-height: 120px;
  overflow: auto;
  font: 12px var(--mono);
  color: var(--muted);
  white-space: pre-wrap;
}
.acts {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}
.acts button {
  height: 28px;
  padding: 0 12px;
  border: 1px solid var(--stroke);
  border-radius: 8px;
  background: var(--surface);
  font-size: 12.5px;
  font-weight: 500;
}
.acts .allow {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--on-accent);
}
.outcome {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--muted);
}
</style>
