<script setup lang="ts">
import type { WorkspaceSummary } from '@drums/protocol';
import { useUi } from '../../stores/ui';
import { useWorkspaces } from '../../stores/workspaces';

const workspaces = useWorkspaces();
const ui = useUi();

const initials = ({ goal }: WorkspaceSummary) =>
  goal
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');

const open = (id: string) => void workspaces.open(id).catch(ui.report);
</script>

<template>
  <aside class="strip" aria-label="Workspaces">
    <div class="list">
      <button
        v-for="workspace in workspaces.workspaces"
        :key="workspace.id"
        type="button"
        class="item"
        :class="{ on: workspace.id === workspaces.currentId }"
        @click="open(workspace.id)"
      >
        <span class="icon">{{ initials(workspace) }}<i :class="`st-${workspace.status}`" /></span>
        <span class="text">
          <span class="goal">{{ workspace.goal }}</span>
          <span class="meta">{{ workspace.status }}<template v-if="workspace.lastRole"> · {{ workspace.lastRole }}</template></span>
        </span>
      </button>
    </div>
    <button class="new" type="button" @click="ui.newWorkspaceOpen = true">
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
  overflow: hidden;
  background: var(--surface);
  border-right: 1px solid var(--line);
  transition: width 0.18s;
}
.strip:hover,
.strip:has(:focus-visible) {
  width: 300px;
  box-shadow: 8px 0 32px var(--shadow);
}
@media (prefers-reduced-motion: reduce) {
  .strip {
    transition: none;
  }
}
.list {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px;
  overflow: hidden auto;
  scrollbar-width: none;
}
.item {
  display: flex;
  flex: none;
  align-items: flex-start;
  gap: 12px;
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
