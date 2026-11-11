<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';
import AddAgent from './components/dialogs/AddAgent.vue';
import NewWorkspace from './components/dialogs/NewWorkspace.vue';
import SendPopover from './components/dialogs/SendPopover.vue';
import ArtifactStage from './components/layout/ArtifactStage.vue';
import ChatFab from './components/layout/ChatFab.vue';
import ChatRail from './components/layout/ChatRail.vue';
import ConnectionLost from './components/layout/ConnectionLost.vue';
import PhoneTabs from './components/layout/PhoneTabs.vue';
import PhoneTopBar from './components/layout/PhoneTopBar.vue';
import WorkspaceDetails from './components/layout/WorkspaceDetails.vue';
import WorkspaceStrip from './components/layout/WorkspaceStrip.vue';
import { useKeyboardViewport } from './composables/useKeyboardViewport';
import { useUi } from './stores/ui';
import { useWorkspaces } from './stores/workspaces';

const workspaces = useWorkspaces();
const ui = useUi();
useKeyboardViewport();

/** Never while typing: `\\` is a character there. */
const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select') !== null);

const onKey = (event: KeyboardEvent) => {
  if (event.key !== '\\' || event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target) || !workspaces.current) return;
  event.preventDefault();
  ui.toggleRail();
};

/** A phone drops the connection of an app in the background: coming back is not an outage. */
const onVisible = () => {
  if (document.visibilityState === 'visible' && ui.offline) void workspaces.boot().catch(ui.report);
};

onMounted(() => {
  window.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onVisible);
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey);
  document.removeEventListener('visibilitychange', onVisible);
});
</script>

<template>
  <div class="app" :style="ui.keyboardHeight === undefined ? undefined : { height: `${ui.keyboardHeight}px` }">
    <WorkspaceStrip />
    <PhoneTopBar />
    <div class="body" :class="{ 'no-chat': !ui.booting && !workspaces.current, collapsed: ui.railCollapsed }" :style="{ '--rail-width': `${ui.railWidth}px` }" :data-tab="ui.phoneTab">
      <template v-if="ui.booting">
        <section class="rail" aria-busy="true"><div class="skeleton"><i /><i /><i /></div></section>
        <main class="stage" aria-busy="true"><div class="skeleton"><i /><i /><i /></div></main>
      </template>
      <template v-else>
        <ChatRail v-if="workspaces.current" />
        <ArtifactStage />
      </template>
    </div>
    <PhoneTabs v-if="workspaces.current && !ui.booting && ui.keyboardHeight === undefined" />
    <ChatFab v-if="workspaces.current && !ui.booting && ui.railCollapsed" />
    <WorkspaceDetails v-if="ui.detailsOpen && workspaces.current" />
    <SendPopover v-if="ui.sendOpen && workspaces.current" />
    <NewWorkspace v-if="ui.newWorkspaceOpen" />
    <AddAgent v-if="ui.addAgentOpen" />
    <ConnectionLost v-if="ui.offline" />
    <div v-if="ui.error" class="toast" role="alert">
      <span>{{ ui.error }}</span>
      <button type="button" aria-label="Dismiss" @click="ui.error = undefined">×</button>
    </div>
  </div>
</template>

<style scoped>
.app {
  position: relative;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: var(--rail-width) minmax(0, 1fr);
  margin-left: 56px;
}
.body.no-chat,
.body.collapsed {
  grid-template-columns: minmax(0, 1fr);
}
.body.collapsed > .rail {
  display: none;
}
.body > section.rail {
  background: var(--surface);
}
.body > main.stage {
  min-width: 0;
}
.skeleton {
  display: grid;
  gap: 10px;
  padding: 18px 16px;
}
.skeleton i {
  height: 12px;
  border-radius: 6px;
  background: var(--surface-2);
  animation: pulse 1.2s ease-in-out infinite;
}
.skeleton i:first-child {
  width: 50%;
}
.skeleton i:last-child {
  width: 80%;
}
@keyframes pulse {
  50% {
    opacity: 0.25;
  }
}
@media (prefers-reduced-motion: reduce) {
  .skeleton i {
    animation: none;
  }
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
  }
  .body > section.rail {
    flex-direction: column;
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
/* Above the tab bar. */
@media (max-width: 900px) {
  .toast {
    bottom: calc(66px + env(safe-area-inset-bottom, 0px));
  }
}
</style>
