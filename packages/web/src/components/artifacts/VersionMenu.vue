<script setup lang="ts">
import { computed, watch } from 'vue';
import { useAgents } from '../../stores/agents';
import { useArtifacts } from '../../stores/artifacts';
import { useUi } from '../../stores/ui';
import { shortTime } from '../../time';
import ResponsivePanel from '../shared/ResponsivePanel.vue';
import ChangesSwitch from './ChangesSwitch.vue';

const artifacts = useArtifacts();
const agents = useAgents();
const ui = useUi();
const close = () => (ui.versionsAt = undefined);
watch(() => artifacts.currentId, close);

const versions = computed(() => [...(artifacts.current?.versions ?? [])].reverse());
/** Fixed to the screen: the row of tabs scrolls sideways, which would clip it. */
const position = computed(() => ({ left: `${ui.versionsAt?.left ?? 0}px`, top: `${ui.versionsAt?.top ?? 0}px`, width: '300px' }));

const pick = (version: number) => {
  if (artifacts.currentId) artifacts.open(artifacts.currentId, version);
  close();
};
</script>

<template>
  <ResponsivePanel label="Versions" dismiss-trigger="[data-version-trigger]" :style="position" @close="close">
    <h4 class="phone-only">{{ artifacts.current?.title }} versions</h4>
    <button v-for="v in versions" :key="v.version" type="button" :class="{ on: v.version === artifacts.viewing }" :aria-current="v.version === artifacts.viewing" @click="pick(v.version)">
      v{{ v.version }} · {{ agents.nameOf(v.by) }} · {{ shortTime(v.at) }}
      <small>{{ v.note }}</small>
    </button>
    <div class="phone-only changes"><ChangesSwitch /></div>
  </ResponsivePanel>
</template>

<style scoped>
h4 {
  margin: 0 0 8px;
  font-size: 15px;
  font-weight: 600;
}
button {
  display: block;
  width: 100%;
  padding: 7px 8px;
  border: 0;
  border-radius: 8px;
  background: none;
  text-align: left;
}
button:hover {
  background: var(--surface-2);
}
button.on {
  background: var(--accent-soft);
}
small {
  display: block;
  font-size: 12px;
  color: var(--muted);
}
.changes {
  margin-top: 10px;
}
</style>
