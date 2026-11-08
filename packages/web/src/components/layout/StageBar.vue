<script setup lang="ts">
import { computed } from 'vue';
import { useWorkspaceSummary } from '../../composables/useWorkspaceSummary';
import { rendererFor } from '../../renderers';
import { useArtifacts } from '../../stores/artifacts';
import { useMap } from '../../stores/map';
import { useUi } from '../../stores/ui';
import { useWorkspaces } from '../../stores/workspaces';
import ArtifactTabs from '../artifacts/ArtifactTabs.vue';
import ChangesSwitch from '../artifacts/ChangesSwitch.vue';
import StatusDot from '../shared/StatusDot.vue';
import PrLinks from './PrLinks.vue';
import SendButton from './SendButton.vue';

const workspaces = useWorkspaces();
const artifacts = useArtifacts();
const map = useMap();
const ui = useUi();
const { name, status, openPrsLabel } = useWorkspaceSummary();

const hasArtifacts = computed(() => artifacts.artifacts.length > 0);
const showsChanges = computed(() => artifacts.current !== undefined && !rendererFor(artifacts.current.renderer)?.ownVersions);
</script>

<template>
  <header class="stage-bar" :class="{ 'no-tabs': !hasArtifacts }">
    <button v-if="ui.railCollapsed" type="button" class="crumb" data-details-trigger :title="workspaces.current?.goal" :aria-expanded="ui.detailsOpen" @click="ui.detailsOpen = !ui.detailsOpen">
      <StatusDot :status="status" /><span>{{ name }}</span>
    </button>
    <ArtifactTabs v-if="hasArtifacts" />
    <div class="actions">
      <ChangesSwitch v-if="showsChanges" />
      <PrLinks v-if="map.opened.length > 0" class="pr-links" />
      <button v-if="map.changed.length > 0" class="action-button" type="button" @click="ui.openPrsOpen = true">
        {{ openPrsLabel }}
      </button>
      <SendButton />
    </div>
  </header>
</template>

<style scoped>
.stage-bar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 52px;
  padding: 0 14px 0 16px;
}
.crumb {
  flex: 0 1 auto;
  max-width: 210px;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 7px;
  margin-right: 8px;
  padding: 0;
  border: 0;
  background: none;
  font-size: 13px;
  font-weight: 600;
}
.crumb span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.actions {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}
.pr-links {
  margin: 0 6px;
}
/* Phones: only the artifact chips. Send and Open PR live in the top bar and the details sheet. */
@media (max-width: 900px) {
  .stage-bar {
    height: 42px;
    padding: 0 8px;
    background: var(--surface);
  }
  .stage-bar.no-tabs,
  .crumb,
  .actions {
    display: none;
  }
}
</style>
