<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useUi } from '../../stores/ui';
import { useWorkspaces } from '../../stores/workspaces';

const workspaces = useWorkspaces();
const ui = useUi();
const goal = ref('');
const starting = ref(false);
const input = ref<HTMLTextAreaElement>();

onMounted(() => input.value?.focus());

const start = async () => {
  if (!goal.value.trim() || starting.value) return;
  starting.value = true;
  try {
    await workspaces.create(goal.value.trim());
    ui.newWorkspaceOpen = false;
  } catch (error) {
    ui.report(error);
  } finally {
    starting.value = false;
  }
};
</script>

<template>
  <div class="scrim" @click.self="ui.newWorkspaceOpen = false">
    <form class="modal" aria-label="New workspace" @submit.prevent="start" @keydown.esc="ui.newWorkspaceOpen = false">
      <h3>New workspace</h3>
      <label for="goal">Goal</label>
      <textarea id="goal" ref="input" v-model="goal" rows="4" placeholder="e.g. Scope a loyalty programme: points per euro, rewards, what it costs us." required />
      <div class="acts">
        <button type="button" @click="ui.newWorkspaceOpen = false">Cancel</button>
        <button class="primary" type="submit" :disabled="!goal.trim() || starting">Start</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.scrim {
  position: fixed;
  z-index: 50;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(15, 20, 30, 0.35);
}
.modal {
  width: min(520px, 100%);
  padding: 20px;
  border-radius: 14px;
  background: var(--surface);
  box-shadow: 0 20px 60px var(--shadow);
}
h3 {
  margin: 0 0 14px;
  font-size: 16px;
  font-weight: 600;
}
label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 500;
}
textarea {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--stroke);
  border-radius: 10px;
  background: var(--bg);
  color: inherit;
  font: inherit;
  resize: vertical;
}
.acts {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
}
.acts button {
  height: 36px;
  padding: 0 12px;
  border: 1px solid var(--stroke);
  border-radius: 10px;
  background: var(--surface);
  font-size: 13.5px;
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
