<script setup lang="ts">
import type { PrDrafts } from '@drums/protocol';
import { computed, onMounted, ref } from 'vue';
import { api } from '../../api/client';
import { useMap } from '../../stores/map';
import { useUi } from '../../stores/ui';
import { useWorkspaces } from '../../stores/workspaces';

const workspaces = useWorkspaces();
const map = useMap();
const ui = useUi();

const drafts = ref<PrDrafts>();
const title = ref('');
const bodies = ref<Record<string, string>>({});
const chosen = ref<Record<string, boolean>>({});
const opening = ref(false);

const changed = computed(() => (drafts.value?.repos ?? []).filter((repo) => repo.files > 0 && !repo.pr));
const unchanged = computed(() => (drafts.value?.repos ?? []).filter((repo) => repo.files === 0 && !repo.pr));
const picked = computed(() => changed.value.filter((repo) => chosen.value[repo.name]));
const plural = computed(() => (drafts.value?.repos.length ?? 0) > 1);

onMounted(async () => {
  if (!workspaces.currentId) return;
  try {
    const loaded = await api.prDrafts(workspaces.currentId);
    drafts.value = loaded;
    title.value = loaded.title;
    bodies.value = Object.fromEntries(loaded.repos.map((repo) => [repo.name, repo.body]));
    chosen.value = Object.fromEntries(loaded.repos.map((repo) => [repo.name, true]));
  } catch (error) {
    ui.report(error);
    ui.openPrsOpen = false;
  }
});

const open = async () => {
  if (!workspaces.currentId || !title.value.trim() || picked.value.length === 0 || opening.value) return;
  opening.value = true;
  try {
    const repos = picked.value.map(({ name }) => ({ name, body: bodies.value[name] ?? '' }));
    await api.openPrs(workspaces.currentId, { title: title.value.trim(), repos });
    ui.openPrsOpen = false;
  } catch (error) {
    ui.report(error);
  } finally {
    opening.value = false;
    await map.load(workspaces.currentId).catch(ui.report);
  }
};
</script>

<template>
  <div class="scrim" @click.self="ui.openPrsOpen = false">
    <form class="modal wide" aria-label="Open pull requests" @submit.prevent="open" @keydown.esc="ui.openPrsOpen = false">
      <h3>{{ plural ? 'Open pull requests' : 'Open a pull request' }}</h3>
      <template v-if="drafts">
        <p class="hint">
          Pushes <code>{{ drafts.branch }}</code>{{ plural ? ' in each repo. The PRs link to each other.' : '.' }} Uncommitted work is committed first.
        </p>
        <label for="pr-title">Title</label>
        <input id="pr-title" v-model="title" required />
        <div v-for="repo in changed" :key="repo.name" class="repo">
          <label class="pick">
            <input v-model="chosen[repo.name]" type="checkbox" /> {{ repo.name }}
            <small>{{ drafts.branch }} → {{ repo.base }} · +{{ repo.additions }} −{{ repo.deletions }}</small>
          </label>
          <textarea v-model="bodies[repo.name]" rows="5" :aria-label="`Description for ${repo.name}`" />
        </div>
        <p v-for="repo in unchanged" :key="repo.name" class="hint">{{ repo.name }}: no changes, no PR.</p>
      </template>
      <div class="acts">
        <button type="button" @click="ui.openPrsOpen = false">Cancel</button>
        <button class="primary" type="submit" :disabled="picked.length === 0 || !title.trim() || opening">
          {{ picked.length > 1 ? `Open ${picked.length} PRs` : 'Open PR' }}
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped src="./modal.css"></style>
<style scoped>
.wide {
  max-height: 90vh;
  overflow: auto;
}
.hint {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--muted);
}
input:not([type='checkbox']) {
  width: 100%;
  height: 36px;
  padding: 0 10px;
  border: 1px solid var(--stroke);
  border-radius: 10px;
  background: var(--bg);
  color: inherit;
  font: inherit;
}
.repo {
  margin-top: 12px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
}
.pick {
  display: flex;
  align-items: center;
  gap: 8px;
}
.pick small {
  margin-left: auto;
  font: 12px var(--mono);
  color: var(--muted);
}
</style>
