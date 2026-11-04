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

<style scoped src="./modal.css"></style>
