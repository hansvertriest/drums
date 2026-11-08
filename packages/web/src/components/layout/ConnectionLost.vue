<script setup lang="ts">
import { ref } from 'vue';
import { useUi } from '../../stores/ui';
import { useWorkspaces } from '../../stores/workspaces';
import EmptyState from './EmptyState.vue';

const workspaces = useWorkspaces();
const ui = useUi();
const retrying = ref(false);

const retry = async () => {
  retrying.value = true;
  await workspaces.boot().catch(ui.report);
  retrying.value = false;
};
</script>

<template>
  <div class="lost" role="alert">
    <EmptyState logo title="Can't reach drums" text="The server on your Mac is not answering. Your work is safe.">
      <button type="button" class="action-button primary" :disabled="retrying" @click="retry">Try again</button>
    </EmptyState>
  </div>
</template>

<style scoped>
/* Over the app rather than instead of it, so what is being typed survives. */
.lost {
  position: absolute;
  z-index: 70;
  inset: 0;
  display: flex;
  background: var(--bg);
}
</style>
