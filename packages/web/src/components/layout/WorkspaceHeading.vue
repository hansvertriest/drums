<script setup lang="ts">
import { ref, watch } from 'vue';
import { useUi } from '../../stores/ui';
import WorkspaceNameButton from './WorkspaceNameButton.vue';

const ui = useUi();
const collapse = ref<HTMLButtonElement>();

/** Back from the floating button: the keyboard stays where it was. */
watch(
  () => ui.railCollapsed,
  (collapsed) => {
    if (!collapsed) collapse.value?.focus({ preventScroll: true });
  },
  { flush: 'post' },
);
</script>

<template>
  <div class="heading">
    <WorkspaceNameButton />
    <button ref="collapse" type="button" class="icon-button" aria-label="Collapse chat" title="Collapse chat (\)" @click="ui.toggleRail()">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="3" width="12" height="10" rx="2" /><path d="M6 3v10" /></svg>
    </button>
  </div>
</template>

<style scoped>
.heading {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 52px;
  padding: 0 8px 0 14px;
}
/* The phone's top bar says this. */
@media (max-width: 900px) {
  .heading {
    display: none;
  }
}
</style>
