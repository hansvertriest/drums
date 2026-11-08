<script setup lang="ts">
import { useUi } from '../../stores/ui';

const ui = useUi();
</script>

<template>
  <label class="switch"><input v-model="ui.showChanges" type="checkbox" /> Changes</label>
</template>

<style scoped>
.switch {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin-right: 6px;
  font-size: 12.5px;
  color: var(--muted);
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}
.switch input {
  appearance: none;
  position: relative;
  flex: none;
  width: 26px;
  height: 16px;
  margin: 0;
  border-radius: 8px;
  background: var(--line);
  cursor: pointer;
  transition: background 0.15s;
}
.switch input::after {
  content: '';
  position: absolute;
  left: 2px;
  top: 2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--surface);
  transition: transform 0.15s;
}
.switch input:checked {
  background: var(--accent);
}
.switch input:checked::after {
  transform: translateX(10px);
}
</style>
