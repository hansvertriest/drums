<script setup lang="ts">
import type { WorkspaceSummary } from '@drums/protocol';
import { computed, ref } from 'vue';
import { useNews } from '../../stores/news';
import { useUi } from '../../stores/ui';
import { useWorkspaces } from '../../stores/workspaces';
import { workspaceName } from '../../composables/useWorkspaceSummary';
import StatusDot from '../shared/StatusDot.vue';
import AppLogo from './AppLogo.vue';

const workspaces = useWorkspaces();
const ui = useUi();
const news = useNews();
const showArchived = ref(false);
const active = computed(() => workspaces.workspaces.filter((workspace) => !workspace.archived));
const archived = computed(() => workspaces.workspaces.filter((workspace) => workspace.archived));

const initials = (workspace: WorkspaceSummary) =>
  workspaceName(workspace)
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');

const open = (id: string) => {
  ui.drawerOpen = false;
  void workspaces.open(id).catch(ui.report);
};
</script>

<template>
  <div v-if="ui.drawerOpen" class="scrim" @click="ui.drawerOpen = false" />
  <aside class="strip" :class="{ open: ui.drawerOpen }" aria-label="Workspaces">
    <div class="brand"><AppLogo />drums</div>
    <div class="list">
      <button
        v-for="workspace in showArchived ? [...active, ...archived] : active"
        :key="workspace.id"
        type="button"
        class="item"
        :class="{ on: workspace.id === workspaces.currentId, archived: workspace.archived }"
        @click="open(workspace.id)"
      >
        <span class="icon">{{ initials(workspace) }}<StatusDot class="corner" :status="workspace.status" /><b v-if="workspace.id !== workspaces.currentId && news.hasNews(workspace)" class="news" title="New since you looked" /></span>
        <span class="text">
          <span class="goal" :title="workspace.goal">{{ workspaceName(workspace) }}</span>
          <span class="meta">{{ workspace.status }}<template v-if="workspace.lastRole"> · {{ workspace.lastRole }}</template><template v-if="workspace.additions !== undefined"> · +{{ workspace.additions }} −{{ workspace.deletions }}</template></span>
        </span>
      </button>
      <button v-if="archived.length > 0" type="button" class="toggle" :aria-expanded="showArchived" @click="showArchived = !showArchived">
        {{ showArchived ? 'Hide archived' : `Archived (${archived.length})` }}
      </button>
    </div>
    <button class="new" type="button" @click="(ui.newWorkspaceOpen = true), (ui.drawerOpen = false)">
      <span class="plus" aria-hidden="true">+</span>New workspace
    </button>
  </aside>
</template>

<style scoped>
/* A 56px column that opens over the page on hover, without moving anything. */
.strip {
  position: absolute;
  z-index: 30;
  inset: 0 auto 0 0;
  width: 56px;
  display: flex;
  flex-direction: column;
  /* Not `hidden`: that can still be scrolled, by a focus or a click while it opens, and then it stays sideways. */
  overflow: clip;
  background: var(--surface);
  transition: width 0.18s;
}
@media (min-width: 901px) {
  .strip:hover,
  .strip:has(:focus-visible) {
    width: 290px;
    box-shadow: 8px 0 32px var(--shadow);
  }
}
/* Phones: a drawer. */
@media (max-width: 900px) {
  .strip {
    position: fixed;
    z-index: 35;
    inset: 0 auto 0 0;
    width: min(300px, 86vw);
    padding-top: env(safe-area-inset-top, 0px);
    transform: translateX(-102%);
    transition: transform 0.2s;
  }
  .strip.open {
    box-shadow: 0 0 40px var(--shadow);
    transform: none;
  }
}
.scrim {
  position: fixed;
  z-index: 34;
  inset: 0;
  background: var(--shadow);
}
@media (prefers-reduced-motion: reduce) {
  .strip {
    transition: none;
  }
}
.brand {
  flex: none;
  display: flex;
  align-items: center;
  gap: 20px;
  width: 290px;
  height: 52px;
  padding-left: 15px;
  font: 600 16px var(--sans);
  white-space: nowrap;
}
.list {
  flex: 1;
  /* As wide as the strip gets, with the strip clipping it: there is nothing to scroll sideways, however narrow it is now. */
  width: 290px;
  max-width: 100vw;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0 8px;
  overflow: hidden auto;
  scrollbar-width: none;
  min-height: 0;
}
.item {
  display: flex;
  flex: none;
  align-items: center;
  /* Puts the text just past the edge of the narrow strip. */
  gap: 12px;
  width: 274px;
  padding: 6px 2px;
  border: 0;
  border-radius: 10px;
  background: none;
  text-align: left;
}
.item.archived {
  opacity: 0.6;
}
.toggle {
  flex: none;
  width: 274px;
  margin-top: 4px;
  padding: 6px 4px 6px 50px;
  border: 0;
  border-radius: 10px;
  background: none;
  font-size: 12px;
  color: var(--muted);
  text-align: left;
  white-space: nowrap;
}
.toggle:hover {
  background: var(--surface-2);
}
.item:hover {
  background: var(--surface-2);
}
/* While closed, only its icon says which workspace is open. */
.strip.open .item.on {
  background: var(--accent-soft);
}
@media (min-width: 901px) {
  .strip:hover .item.on,
  .strip:has(:focus-visible) .item.on {
    background: var(--accent-soft);
  }
}
.icon {
  position: relative;
  flex: none;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: var(--surface-2);
  font: 600 12px var(--mono);
  color: var(--muted);
}
.item.on .icon {
  background: var(--accent-soft);
  color: var(--accent);
}
.icon .corner {
  position: absolute;
  right: -2px;
  bottom: -2px;
  width: 11px;
  height: 11px;
  border: 2px solid var(--surface);
}
.news {
  position: absolute;
  top: -2px;
  right: -2px;
  width: 10px;
  height: 10px;
  border: 2px solid var(--surface);
  border-radius: 50%;
  background: var(--accent);
}
.text {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 3px;
  padding-right: 6px;
}
.goal {
  overflow: hidden;
  font-weight: 500;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.meta {
  font-size: 12px;
  color: var(--muted);
}
.new {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: none;
  width: 274px;
  margin: 0 8px 10px;
  padding: 6px 2px;
  border: 0;
  border-radius: 10px;
  background: none;
  font-weight: 500;
  text-align: left;
  white-space: nowrap;
}
.new:hover {
  background: var(--surface-2);
}
.plus {
  flex: none;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--surface-2);
  color: var(--muted);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 400;
}
/* The drawer is as wide as the screen allows, so its contents follow it. */
@media (max-width: 900px) {
  .brand,
  .list {
    width: auto;
  }
  .item,
  .toggle {
    width: 100%;
  }
  .new {
    width: auto;
    margin-bottom: calc(10px + env(safe-area-inset-bottom, 0px));
  }
}
</style>
