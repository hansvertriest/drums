<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useUi } from '../../stores/ui';

const ui = useUi();
const button = ref<HTMLButtonElement>();

/** It takes the place of the button that folded the rail, so the keyboard stays where it was. */
onMounted(() => button.value?.focus({ preventScroll: true }));
</script>

<template>
  <button ref="button" type="button" class="fab" aria-label="Open chat" title="Open chat (\)" @click="ui.toggleRail()">
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5v6a1.5 1.5 0 0 1-1.5 1.5H8l-3.5 3v-3h0A1.5 1.5 0 0 1 3 10.5z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
    </svg>
    <b v-if="ui.railNews" class="dot" role="status" aria-label="An agent posted" />
  </button>
</template>

<style scoped>
.fab {
  position: absolute;
  z-index: 25;
  left: 72px;
  bottom: calc(16px + env(safe-area-inset-bottom, 0px));
  width: 46px;
  height: 46px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 50%;
  background: var(--accent);
  color: var(--on-accent);
  box-shadow: 0 6px 20px var(--shadow);
}
.fab:hover {
  filter: brightness(1.08);
}
.dot {
  position: absolute;
  top: 1px;
  right: 1px;
  width: 12px;
  height: 12px;
  border: 2px solid var(--bg);
  border-radius: 50%;
  background: var(--mod);
}
@media (max-width: 900px) {
  .fab {
    display: none;
  }
}
</style>
