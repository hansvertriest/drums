<script setup lang="ts">
defineProps<{ status?: string }>();
</script>

<template>
  <i class="dot" :class="`st-${status}`" />
</template>

<style scoped>
.dot {
  flex: none;
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--edge);
}
.st-running {
  background: var(--accent);
  animation: pulse 1.2s ease-in-out infinite;
}
.st-input {
  background: var(--mod);
}
.st-review {
  background: var(--add);
}
@keyframes pulse {
  50% {
    opacity: 0.25;
  }
}
@media (prefers-reduced-motion: reduce) {
  .st-running {
    animation: none;
  }
}
</style>
