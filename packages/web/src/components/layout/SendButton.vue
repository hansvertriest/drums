<script setup lang="ts">
import { useWorkspaceSummary } from '../../composables/useWorkspaceSummary';
import { useUi } from '../../stores/ui';

const ui = useUi();
const { pendingCount } = useWorkspaceSummary();
</script>

<template>
  <button class="action-button send" :class="{ primary: pendingCount > 0 }" type="button" :aria-expanded="ui.sendOpen" @click="ui.sendOpen = !ui.sendOpen">
    Send <span class="count">{{ pendingCount }}</span>
  </button>
</template>

<style scoped>
.send {
  flex: none;
}
.count {
  font-weight: 600;
}
</style>
