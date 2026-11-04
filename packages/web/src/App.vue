<script setup lang="ts">
import NewWorkspace from './components/dialogs/NewWorkspace.vue';
import AppHeader from './components/layout/AppHeader.vue';
import ArtifactStage from './components/layout/ArtifactStage.vue';
import ChatRail from './components/layout/ChatRail.vue';
import WorkspaceStrip from './components/layout/WorkspaceStrip.vue';
import { useUi } from './stores/ui';
import { useWorkspaces } from './stores/workspaces';

const workspaces = useWorkspaces();
const ui = useUi();
</script>

<template>
  <div class="app">
    <AppHeader />
    <WorkspaceStrip />
    <div class="body" :class="{ 'no-chat': !workspaces.current }">
      <ChatRail v-if="workspaces.current" />
      <ArtifactStage />
    </div>
    <NewWorkspace v-if="ui.newWorkspaceOpen" />
    <div v-if="ui.error" class="toast" role="alert">
      <span>{{ ui.error }}</span>
      <button type="button" aria-label="Dismiss" @click="ui.error = undefined">×</button>
    </div>
  </div>
</template>

<style scoped>
.app {
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
}
.body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 360px minmax(0, 1fr);
  margin-left: 60px;
}
.body.no-chat {
  grid-template-columns: minmax(0, 1fr);
}
.toast {
  position: absolute;
  z-index: 60;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: min(560px, 90%);
  padding: 8px 12px;
  border-radius: 10px;
  background: var(--ink);
  color: var(--bg);
  font-size: 13px;
  box-shadow: 0 8px 24px var(--shadow);
}
.toast button {
  border: 0;
  background: none;
  color: inherit;
  font-size: 16px;
}
</style>
