<script setup lang="ts">
import { computed } from 'vue';
import { useAgents } from '../../stores/agents';
import { useArtifacts } from '../../stores/artifacts';
import { useUi } from '../../stores/ui';
import { shortTime } from '../../time';

const artifacts = useArtifacts();
const agents = useAgents();
const ui = useUi();

const versions = computed(() => [...(artifacts.current?.versions ?? [])].reverse());
const shown = computed(() => versions.value.find((v) => v.version === artifacts.viewing));

const pick = (event: Event) => {
  const id = artifacts.currentId;
  if (id) artifacts.open(id, Number((event.target as HTMLSelectElement).value));
};
</script>

<template>
  <div class="bar">
    <select aria-label="Version" :value="artifacts.viewing" @change="pick">
      <option v-for="v in versions" :key="v.version" :value="v.version">
        v{{ v.version }} · {{ agents.nameOf(v.by) }} · {{ shortTime(v.at) }}
      </option>
    </select>
    <span class="note">{{ shown?.note }}</span>
    <label class="switch"><input v-model="ui.showChanges" type="checkbox" /> Changes</label>
  </div>
  <div v-if="!artifacts.isLatest" class="old">
    Read-only: this is an older version.
    <button type="button" @click="artifacts.currentId && artifacts.open(artifacts.currentId)">Latest</button>
  </div>
</template>

<style scoped>
.bar {
  display: flex;
  flex-wrap: wrap;
  flex: none;
  align-items: center;
  gap: 8px 14px;
  padding: 10px 16px;
}
select {
  height: 34px;
  max-width: 320px;
  min-width: 0;
  padding: 0 8px;
  border: 1px solid var(--stroke);
  border-radius: 10px;
  background: var(--surface);
  color: inherit;
  font: inherit;
  font-size: 13px;
}
.note {
  flex: 1 1 200px;
  min-width: 0;
  font-size: 12.5px;
  color: var(--muted);
}
.switch {
  display: inline-flex;
  align-items: center;
  gap: 8px;
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
  width: 30px;
  height: 18px;
  margin: 0;
  border-radius: 999px;
  background: var(--line);
  cursor: pointer;
  transition: background 0.15s;
}
.switch input::after {
  content: '';
  position: absolute;
  left: 2px;
  top: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--surface);
  transition: transform 0.15s;
}
.switch input:checked {
  background: var(--accent);
}
.switch input:checked::after {
  transform: translateX(12px);
}
.old {
  display: flex;
  flex: none;
  gap: 10px;
  align-items: center;
  margin: 0 16px 8px;
  padding: 7px 12px;
  border-radius: 9px;
  background: var(--mod-bg);
  color: var(--mod);
  font-size: 12.5px;
}
.old button {
  margin-left: auto;
  border: 0;
  background: none;
  color: inherit;
  font-weight: 600;
  text-decoration: underline;
}
</style>
