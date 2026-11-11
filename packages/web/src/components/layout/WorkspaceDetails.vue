<script setup lang="ts">
import { computed } from 'vue';
import { useWorkspaceSummary } from '../../composables/useWorkspaceSummary';
import { useAgents } from '../../stores/agents';
import { useMap } from '../../stores/map';
import { useUi } from '../../stores/ui';
import { useWorkspaces } from '../../stores/workspaces';
import ResponsivePanel from '../shared/ResponsivePanel.vue';

const workspaces = useWorkspaces();
const agents = useAgents();
const map = useMap();
const ui = useUi();
const { statusLabel } = useWorkspaceSummary();
const close = () => (ui.detailsOpen = false);

const repos = computed(() => map.repos.map((repo) => repo.name).join(', '));

const archive = () => {
  const archived = !workspaces.current?.archived;
  if (archived && !window.confirm('Archive this workspace? Its agents stop. Worktrees, branches and everything posted stay, and you can restore it.')) return;
  close();
  void workspaces.setArchived(archived).catch(ui.report);
};
</script>

<template>
  <ResponsivePanel label="Workspace details" dismiss-trigger="[data-details-trigger]" :style="{ top: '50px', left: '68px', width: '330px' }" @close="close">
    <h4 class="phone-only">{{ workspaces.current?.goal }}</h4>
    <dl>
      <dt>Status</dt>
      <dd>{{ statusLabel }}</dd>
      <dt>Agents</dt>
      <dd>{{ agents.open.length }}</dd>
      <template v-if="map.branch">
        <dt>Branch</dt>
        <dd><code>{{ map.branch }}</code></dd>
        <dt>Repos</dt>
        <dd><code>{{ repos }}</code></dd>
      </template>
    </dl>
    <div class="acts">
      <button type="button" class="action-button" @click="archive">{{ workspaces.current?.archived ? 'Restore' : 'Archive' }}</button>
    </div>
  </ResponsivePanel>
</template>

<style scoped>
h4 {
  margin: 0 0 8px;
  font-size: 15px;
  font-weight: 600;
}
dl {
  display: grid;
  grid-template-columns: 70px 1fr;
  gap: 4px 10px;
  margin: 0;
}
dt {
  color: var(--muted);
}
dd {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
}
code {
  font: 12px var(--mono);
}
.acts {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 10px;
}
</style>
