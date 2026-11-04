<script setup lang="ts">
import { useArtifacts } from '../../stores/artifacts';
import { useFocus } from '../../stores/focus';

const focus = useFocus();
const artifacts = useArtifacts();
</script>

<template>
  <div v-if="focus.focus" class="chip">
    <span class="label">About: {{ artifacts.titleOf(focus.focus.artifact) }} · v{{ focus.focus.version }}</span>
    <button type="button" aria-label="Remove focus" @click="focus.remove()">×</button>
  </div>
</template>

<style scoped>
.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  margin: 0 2px 6px;
  padding: 1px 3px 1px 9px;
  border: 1px solid var(--stroke);
  border-radius: 999px;
  background: var(--bg);
  font-size: 12px;
  color: var(--muted);
}
.label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
button {
  flex: none;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: none;
  font-size: 14px;
  line-height: 1;
  color: var(--muted);
}
button:hover {
  background: var(--surface-2);
  color: var(--ink);
}
</style>
