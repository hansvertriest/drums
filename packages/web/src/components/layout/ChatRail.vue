<script setup lang="ts">
import { ref } from 'vue';
import { RAIL_WIDTH, useUi } from '../../stores/ui';
import AgentTabs from '../chat/AgentTabs.vue';
import Composer from '../chat/Composer.vue';
import Thread from '../chat/Thread.vue';

const ui = useUi();
const rail = ref<HTMLElement>();
const dragging = ref(false);

/** Captured, so the drag goes on over the artifact frames. */
const startDrag = (event: PointerEvent) => {
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  dragging.value = true;
};
const drag = (event: PointerEvent) => {
  if (dragging.value && rail.value) ui.setRailWidth(event.clientX - rail.value.getBoundingClientRect().left);
};
const onKey = (event: KeyboardEvent) => {
  const step = { ArrowLeft: -24, ArrowRight: 24 }[event.key];
  if (!step) return;
  event.preventDefault();
  ui.setRailWidth(ui.railWidth + step);
};
</script>

<template>
  <section ref="rail" class="rail" aria-label="Chat">
    <AgentTabs />
    <Thread />
    <Composer />
    <div
      class="resize"
      :class="{ dragging }"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize chat"
      title="Drag to resize, double-click to reset"
      tabindex="0"
      :aria-valuenow="ui.railWidth"
      :aria-valuemin="RAIL_WIDTH.min"
      :aria-valuemax="RAIL_WIDTH.max"
      @pointerdown="startDrag"
      @pointermove="drag"
      @pointerup="dragging = false"
      @pointercancel="dragging = false"
      @dblclick="ui.setRailWidth(RAIL_WIDTH.default)"
      @keydown="onKey"
    />
  </section>
</template>

<style scoped>
.rail {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-right: 1px solid var(--line);
  background: var(--surface);
}
.resize {
  position: absolute;
  z-index: 5;
  top: 0;
  right: -4px;
  bottom: 0;
  width: 8px;
  cursor: col-resize;
  touch-action: none;
}
.resize:hover,
.resize.dragging,
.resize:focus-visible {
  background: linear-gradient(to right, transparent 3px, var(--accent) 3px, var(--accent) 5px, transparent 5px);
  outline: none;
}
@media (max-width: 900px) {
  .resize {
    display: none;
  }
}
</style>
