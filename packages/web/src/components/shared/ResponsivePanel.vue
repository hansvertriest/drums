<script setup lang="ts">
import { ref } from 'vue';
import { useDismiss } from '../../composables/useDismiss';

/** Placed with `style` on the web; on phones every panel is the same bottom sheet. */
defineOptions({ inheritAttrs: false });

const props = defineProps<{
  label: string;
  /** What opens it. With this, Esc and a click outside close it too. */
  dismissTrigger?: string;
}>();
const emit = defineEmits<{ close: [] }>();

const panel = ref<HTMLElement>();
if (props.dismissTrigger) useDismiss(panel, props.dismissTrigger, () => emit('close'));
</script>

<template>
  <div class="scrim" @click="emit('close')" />
  <div ref="panel" v-bind="$attrs" class="panel" role="dialog" :aria-label="label">
    <slot />
  </div>
</template>

<style scoped>
.scrim {
  display: none;
}
.panel {
  position: fixed;
  z-index: 40;
  max-height: 70vh;
  padding: 12px;
  overflow: auto;
  border-radius: 12px;
  background: var(--surface);
  box-shadow:
    0 10px 32px var(--shadow),
    0 0 0 1px var(--line);
  font-size: 13px;
}
/* Absolute on phones, so it stays above the keyboard with the app. */
@media (max-width: 900px) {
  .scrim {
    display: block;
    position: absolute;
    z-index: 44;
    inset: 0;
    background: var(--shadow);
  }
  .panel {
    position: absolute;
    z-index: 45;
    /* Over the placement a panel sets inline for the web. */
    inset: auto 0 0 0 !important;
    width: auto !important;
    max-height: 78%;
    padding: 12px 16px calc(20px + env(safe-area-inset-bottom, 0px));
    border-radius: 18px 18px 0 0;
    box-shadow: none;
    font-size: 13.5px;
  }
  .panel::before {
    content: '';
    display: block;
    width: 36px;
    height: 4px;
    margin: 0 auto 12px;
    border-radius: 2px;
    background: var(--line);
  }
}
</style>
