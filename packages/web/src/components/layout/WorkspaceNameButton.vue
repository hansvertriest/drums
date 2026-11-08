<script setup lang="ts">
import { useWorkspaceSummary } from '../../composables/useWorkspaceSummary';
import { useUi } from '../../stores/ui';
import { useWorkspaces } from '../../stores/workspaces';
import StatusDot from '../shared/StatusDot.vue';

const workspaces = useWorkspaces();
const ui = useUi();
const { name, status, statusLabel } = useWorkspaceSummary();
</script>

<template>
  <button type="button" class="name" data-details-trigger :title="workspaces.current?.goal" :aria-expanded="ui.detailsOpen" @click="ui.detailsOpen = !ui.detailsOpen">
    <strong>{{ name }}</strong>
    <small><StatusDot :status="status" />{{ statusLabel }}</small>
  </button>
</template>

<style scoped>
.name {
  flex: 1;
  min-width: 0;
  padding: 0;
  border: 0;
  background: none;
  text-align: left;
}
strong {
  display: block;
  overflow: hidden;
  font-weight: 600;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}
small {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--muted);
}
</style>
