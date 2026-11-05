<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';
import AddAgent from './components/dialogs/AddAgent.vue';
import NewWorkspace from './components/dialogs/NewWorkspace.vue';
import AppHeader from './components/layout/AppHeader.vue';
import ArtifactStage from './components/layout/ArtifactStage.vue';
import ChatFab from './components/layout/ChatFab.vue';
import ChatRail from './components/layout/ChatRail.vue';
import PhoneTabs from './components/layout/PhoneTabs.vue';
import WorkspaceStrip from './components/layout/WorkspaceStrip.vue';
import { useUi } from './stores/ui';
import { useWorkspaces } from './stores/workspaces';

const workspaces = useWorkspaces();
const ui = useUi();

/** Never while typing: `\\` is a character there. */
const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select') !== null);

const onKey = (event: KeyboardEvent) => {
  if (event.key !== '\\' || event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target) || !workspaces.current) return;
  event.preventDefault();
  ui.toggleRail();
};

onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="app">
    <AppHeader />
    <WorkspaceStrip />
    <PhoneTabs v-if="workspaces.current" />
    <div class="body" :class="{ 'no-chat': !workspaces.current, collapsed: ui.railCollapsed }" :style="{ '--rail-width': `${ui.railWidth}px` }" :data-tab="ui.phoneTab">
      <ChatRail v-if="workspaces.current" />
      <ArtifactStage />
    </div>
    <ChatFab v-if="workspaces.current && ui.railCollapsed" />
    <NewWorkspace v-if="ui.newWorkspaceOpen" />
    <AddAgent v-if="ui.addAgentOpen" />
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
  grid-template-columns: var(--rail-width) minmax(0, 1fr);
  margin-left: 60px;
}
.body.no-chat,
.body.collapsed {
  grid-template-columns: minmax(0, 1fr);
}
.body.collapsed > .rail {
  display: none;
}
/* Phones: no column of icons and no folding. The rail and the stage are two tabs. */
@media (max-width: 900px) {
  .body,
  .body.collapsed {
    grid-template-columns: minmax(0, 1fr);
    margin-left: 0;
  }
  .body > .rail,
  .body.collapsed > .rail {
    display: flex;
    border-right: 0;
  }
  .body[data-tab='stage'] > .rail,
  .body[data-tab='stage'].collapsed > .rail {
    display: none;
  }
  .body[data-tab='chat']:not(.no-chat) > .stage {
    display: none;
  }
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
