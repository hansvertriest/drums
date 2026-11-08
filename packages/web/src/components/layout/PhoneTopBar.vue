<script setup lang="ts">
import { computed } from 'vue';
import { useNews } from '../../stores/news';
import { useUi } from '../../stores/ui';
import { useWorkspaces } from '../../stores/workspaces';
import AppLogo from './AppLogo.vue';
import SendButton from './SendButton.vue';
import WorkspaceNameButton from './WorkspaceNameButton.vue';

const workspaces = useWorkspaces();
const news = useNews();
const ui = useUi();
const elsewhere = computed(() => workspaces.workspaces.some((workspace) => workspace.id !== workspaces.currentId && news.hasNews(workspace)));
</script>

<template>
  <header class="topbar">
    <button class="menu" type="button" aria-label="Workspaces" :aria-expanded="ui.drawerOpen" @click="ui.drawerOpen = !ui.drawerOpen">
      <AppLogo />
      <b v-if="elsewhere" class="news" title="New in another workspace" />
    </button>
    <template v-if="workspaces.current">
      <WorkspaceNameButton />
      <SendButton />
    </template>
    <strong v-else class="brand">drums</strong>
  </header>
</template>

<style scoped>
.topbar {
  display: none;
}
@media (max-width: 900px) {
  .topbar {
    flex: none;
    display: flex;
    align-items: center;
    gap: 8px;
    box-sizing: content-box;
    height: 50px;
    padding: env(safe-area-inset-top, 0px) calc(12px + env(safe-area-inset-right, 0px)) 0 calc(12px + env(safe-area-inset-left, 0px));
    background: var(--surface);
  }
}
.menu {
  position: relative;
  flex: none;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  background: none;
}
.news {
  position: absolute;
  top: 3px;
  left: 2px;
  width: 9px;
  height: 9px;
  border: 2px solid var(--surface);
  border-radius: 50%;
  background: var(--accent);
}
.brand {
  flex: 1;
  overflow: hidden;
  font-weight: 600;
}
</style>
