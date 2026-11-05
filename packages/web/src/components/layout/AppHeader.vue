<script setup lang="ts">
import { computed } from 'vue';
import { useAgents } from '../../stores/agents';
import { useAnswers } from '../../stores/answers';
import { useMap } from '../../stores/map';
import { useUi } from '../../stores/ui';
import { useWorkspaces } from '../../stores/workspaces';
import OpenPrs from '../dialogs/OpenPrs.vue';
import SendPopover from '../dialogs/SendPopover.vue';

const STATUS_LABEL: Record<string, string> = {
  input: 'Needs input',
  review: 'Ready for review',
  running: 'Running',
  pr: 'PR open',
  idle: 'Idle',
};

const workspaces = useWorkspaces();
const agents = useAgents();
const answers = useAnswers();
const map = useMap();
const ui = useUi();

const subline = computed(() => {
  if (!workspaces.current) return 'No workspace';
  const count = agents.open.length;
  const agentCount = `${count} agent${count === 1 ? '' : 's'}`;
  return map.branch ? `${agentCount} · ${map.branch} · ${map.repos.map((repo) => repo.name).join(', ')}` : agentCount;
});
const status = computed(() => workspaces.current?.status);
const statusLabel = computed(() => {
  const single = status.value === 'pr' && map.opened.length === 1 ? map.opened[0]?.pr?.number : undefined;
  return single ? `PR #${single} open` : status.value && STATUS_LABEL[status.value];
});
const pendingCount = computed(() => answers.pendingCount + map.pendingComments);

const archive = () => {
  const archived = !workspaces.current?.archived;
  if (archived && !window.confirm('Archive this workspace? Its agents stop. Worktrees, branches and everything posted stay, and you can restore it.')) return;
  void workspaces.setArchived(archived).catch(ui.report);
};
</script>

<template>
  <header class="header">
    <span class="logo-cell">
      <span class="logo" role="img" aria-label="drums">d</span>
    </span>
    <button class="menu" type="button" aria-label="Workspaces" :aria-expanded="ui.drawerOpen" @click="ui.drawerOpen = !ui.drawerOpen">
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" stroke-width="1.6" /></svg>
    </button>
    <div class="title">
      <h1 :title="workspaces.current?.goal">{{ workspaces.current?.title ?? workspaces.current?.goal ?? 'drums' }}</h1>
      <p>{{ subline }}</p>
    </div>
    <span v-if="status" class="pill" :class="`st-${status}`"><i />{{ statusLabel }}</span>
    <span v-if="map.opened.length > 0" class="prs">
      <a v-for="repo in map.opened" :key="repo.name" :href="repo.pr?.url" target="_blank" rel="noopener">{{ map.repos.length > 1 ? repo.name : 'PR ' }}#{{ repo.pr?.number }}</a>
    </span>
    <button v-if="map.changed.length > 0" class="send" type="button" @click="ui.openPrsOpen = true">
      {{ map.changed.length > 1 ? 'Open PRs' : 'Open PR' }}
    </button>
    <div class="send-wrap">
      <button
        class="send"
        :class="{ primary: pendingCount > 0 }"
        type="button"
        :disabled="!workspaces.current"
        :aria-expanded="ui.sendOpen"
        @click="ui.sendOpen = !ui.sendOpen"
      >
        Send <span class="count">{{ pendingCount }}</span>
      </button>
      <SendPopover v-if="ui.sendOpen" />
    </div>
    <button v-if="workspaces.current" class="send" type="button" @click="archive">{{ workspaces.current.archived ? 'Restore' : 'Archive' }}</button>
    <OpenPrs v-if="ui.openPrsOpen" />
  </header>
</template>

<style scoped>
.header {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: none;
  height: 60px;
  padding-right: 20px;
  background: var(--surface);
  border-bottom: 1px solid var(--line);
}
.logo-cell {
  flex: none;
  align-self: stretch;
  width: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-right: 1px solid var(--line);
}
.logo {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--ink);
  color: var(--bg);
  display: flex;
  align-items: center;
  justify-content: center;
  font: 600 16px var(--mono);
}
.menu {
  display: none;
}
.title {
  flex: 1;
  min-width: 0;
}
@media (max-width: 900px) {
  .header {
    flex-wrap: wrap;
    height: auto;
    min-height: 56px;
    gap: 10px;
    padding: 8px 16px 8px 0;
  }
  .logo-cell {
    width: 56px;
    border-right: 0;
  }
  .menu {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    margin-left: -6px;
    border: 1px solid var(--stroke);
    border-radius: 10px;
    background: var(--surface);
  }
  /* The first line is who and what, the second status and actions. */
  .title {
    flex: 1 1 calc(100% - 120px);
  }
  .pill {
    margin-right: auto;
    padding-left: 16px;
  }
}
.title h1 {
  margin: 0;
  overflow: hidden;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.title p {
  margin: 2px 0 0;
  font-size: 12.5px;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font: 500 12.5px var(--sans);
  color: var(--muted);
  white-space: nowrap;
}
.pill i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--line);
}
.st-running i {
  background: var(--accent);
}
.st-input {
  color: var(--mod);
}
.st-input i {
  background: var(--mod);
}
.st-review i {
  background: var(--add);
}
.st-pr i {
  background: var(--pr);
}
.prs {
  display: inline-flex;
  gap: 8px;
  font: 12.5px var(--mono);
}
.prs a {
  color: var(--accent);
}
.send-wrap {
  position: relative;
}
.send {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 36px;
  padding: 0 12px;
  border: 1px solid var(--stroke);
  border-radius: 10px;
  background: var(--surface);
  font-weight: 500;
}
.send.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent);
}
.send:disabled {
  opacity: 0.45;
}
.count {
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--muted);
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.send.primary .count {
  background: var(--on-accent);
  color: var(--accent);
}
</style>
