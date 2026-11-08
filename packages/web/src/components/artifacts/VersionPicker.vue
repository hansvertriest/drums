<script setup lang="ts">
import { useArtifacts } from '../../stores/artifacts';
import { useUi } from '../../stores/ui';
import VersionMenu from './VersionMenu.vue';

const artifacts = useArtifacts();
const ui = useUi();
</script>

<template>
  <VersionMenu v-if="ui.versionsAt" />
  <div v-if="!artifacts.isLatest" class="old">
    Read-only: this is an older version.
    <button type="button" @click="artifacts.currentId && artifacts.open(artifacts.currentId)">Latest</button>
  </div>
</template>

<style scoped>
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
@media (max-width: 900px) {
  .old {
    margin-top: 8px;
  }
}
</style>
