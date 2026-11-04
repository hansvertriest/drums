<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useUi } from '../../stores/ui';
import { useWorkspaces } from '../../stores/workspaces';

const workspaces = useWorkspaces();
const ui = useUi();
const instruction = ref('');
const adding = ref(false);
const input = ref<HTMLTextAreaElement>();

onMounted(() => input.value?.focus());

const add = async () => {
  if (!instruction.value.trim() || adding.value) return;
  adding.value = true;
  try {
    await workspaces.addAgent(instruction.value.trim());
    ui.addAgentOpen = false;
  } catch (error) {
    ui.report(error);
  } finally {
    adding.value = false;
  }
};
</script>

<template>
  <div class="scrim" @click.self="ui.addAgentOpen = false">
    <form class="modal" aria-label="Add agent" @submit.prevent="add" @keydown.esc="ui.addAgentOpen = false">
      <h3>Add agent</h3>
      <label for="instruction">What should it do?</label>
      <textarea id="instruction" ref="input" v-model="instruction" rows="3" placeholder="e.g. Review the scope against the goal" required />
      <div class="acts">
        <button type="button" @click="ui.addAgentOpen = false">Cancel</button>
        <button class="primary" type="submit" :disabled="!instruction.trim() || adding">Add</button>
      </div>
    </form>
  </div>
</template>

<style scoped src="./modal.css"></style>
