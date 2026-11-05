<script setup lang="ts">
import type { WorkspaceSummary } from '@drums/protocol';
import { useNews } from '../../stores/news';
import { useUi } from '../../stores/ui';
import { useWorkspaces } from '../../stores/workspaces';

const workspaces = useWorkspaces();
const ui = useUi();
const news = useNews();

const initials = ({ goal }: WorkspaceSummary) =>
  goal
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
    <div class="list">
      <button
        v-for="workspace in workspaces.workspaces"
        :key="workspace.id"
        type="button"
        class="item"
        :class="{ on: workspace.id === workspaces.currentId }"
        @click="open(workspace.id)"
      >
        <span class="icon">{{ initials(workspace) }}<i :class="`st-${workspace.status}`" /><b v-if="workspace.id !== workspaces.currentId && news.hasNews(workspace)" class="news" title="New since you looked" /></span>
        <span class="text">
          <span class="goal">{{ workspace.goal }}</span>
          <span class="meta">{{ workspace.status }}<template v-if="workspace.lastRole"> · {{ workspace.lastRole }}</template><template v-if="workspace.additions !== undefined"> · +{{ workspace.additions }} −{{ workspace.deletions }}</template></span>
        </span>
      </button>
    </div>
    <button class="new" type="button" @click="(ui.newWorkspaceOpen = true), (ui.drawerOpen = false)">
      <span class="plus" aria-hidden="true">+</span>New workspace
    </button>
  </aside>
</template>

<style scoped>
/* A 60px column that opens over the page on hover, without moving anything. */
.strip {
  position: absolute;
  z-index: 30;
  inset: 60px auto 0 0;
  width: 60px;
  display: flex;
  flex-direction: column;
  /* Not `hidden`: that can still be scrolled, by a focus or a click while it opens, and then it stays sideways. */
  overflow: clip;
  background: var(--surface);
  border-right: 1px solid var(--line);
  transition: width 0.18s;
}
@media (min-width: 901px) {
  .strip:hover,
  .strip:has(:focus-visible) {
    width: 300px;
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
    box-shadow: 0 0 40px var(--shadow);
    transform: translateX(-102%);
    transition: transform 0.2s;
  }
  .strip.open {
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
.list {
  flex: 1;
  /* As wide as the strip gets, with the strip clipping it: there is nothing to scroll sideways, however narrow it is now. */
  width: 300px;
  max-width: 100vw;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px;
  overflow: hidden auto;
  scrollbar-width: none;
  min-height: 0;
}
.item {
  display: flex;
  flex: none;
  align-items: flex-start;
  /* Puts the text just past the edge of the narrow strip. */
  gap: 14px;
  width: 280px;
  padding: 6px 4px;
  border: 0;
  border-radius: 10px;
  background: none;
  text-align: left;
}
.item:hover {
  background: var(--surface-2);
}
.item.on {
  background: var(--accent-soft);
}
.icon {
  position: relative;
  flex: none;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--bg);
  font: 600 11.5px var(--mono);
  color: var(--muted);
}
.item.on .icon {
  border-color: var(--accent);
  color: var(--accent);
}
.icon i {
  position: absolute;
  right: -4px;
  bottom: -4px;
  width: 12px;
  height: 12px;
  border: 2px solid var(--surface);
  border-radius: 50%;
  background: var(--line);
}
.icon i.st-running {
  background: var(--accent);
}
.icon i.st-input {
  background: var(--mod);
}
.icon i.st-review {
  background: var(--add);
}
.news {
  position: absolute;
  top: -4px;
  right: -4px;
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
  width: 280px;
  margin: 0 10px 12px;
  padding: 4px;
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
  width: 32px;
  height: 32px;
  border-radius: 9px;
  background: var(--accent);
  color: var(--on-accent);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
}
</style>
