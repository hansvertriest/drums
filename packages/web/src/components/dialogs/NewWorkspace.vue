<script setup lang="ts">
import type { ProjectList } from '@drums/protocol';
import { onMounted, ref } from 'vue';
import { api } from '../../api/client';
import { useUi } from '../../stores/ui';
import { useWorkspaces } from '../../stores/workspaces';

const workspaces = useWorkspaces();
const ui = useUi();
const goal = ref('');
const starting = ref(false);
const input = ref<HTMLTextAreaElement>();

const projects = ref<ProjectList>([]);
/** Repo name → the base it starts from, for the repos picked. */
const picked = ref<Record<string, string>>({});
const branch = ref('');

const toggle = (name: string, base: string) => {
  const next = { ...picked.value };
  if (next[name]) delete next[name];
  else next[name] = base;
  picked.value = next;
};

onMounted(() => {
  input.value?.focus();
  void api.projects().then((list) => (projects.value = list)).catch(ui.report);
});

const start = async () => {
  if (!goal.value.trim() || starting.value) return;
  starting.value = true;
  try {
    const repos = Object.entries(picked.value).map(([name, base]) => ({ name, base }));
    const named = repos.length > 0 && branch.value.trim() ? { branch: branch.value.trim() } : {};
    await workspaces.create({ goal: goal.value.trim(), repos, ...named });
    ui.newWorkspaceOpen = false;
  } catch (error) {
    ui.report(error);
  } finally {
    starting.value = false;
  }
};
</script>

<template>
  <div class="scrim" @click.self="ui.newWorkspaceOpen = false">
    <form class="modal" aria-label="New workspace" @submit.prevent="start" @keydown.esc="ui.newWorkspaceOpen = false">
      <h3>New workspace</h3>
      <label for="goal">Goal</label>
      <textarea id="goal" ref="input" v-model="goal" rows="4" placeholder="e.g. Scope a loyalty programme: points per euro, rewards, what it costs us." required />
      <template v-if="projects.length > 0">
        <label>Repos</label>
        <div v-for="project in projects" :key="project.name" class="repo">
          <label class="pick"><input type="checkbox" :checked="!!picked[project.name]" @change="toggle(project.name, project.base)" /> {{ project.name }}</label>
          <select v-if="picked[project.name]" v-model="picked[project.name]" :aria-label="`Base branch of ${project.name}`">
            <option v-for="name in project.branches" :key="name" :value="name">{{ name }}</option>
          </select>
        </div>
      </template>
      <template v-if="Object.keys(picked).length > 0">
        <label for="branch">Branch</label>
        <input id="branch" v-model="branch" placeholder="Leave empty and drums names it" />
      </template>
      <div class="acts">
        <button type="button" @click="ui.newWorkspaceOpen = false">Cancel</button>
        <button class="primary" type="submit" :disabled="!goal.trim() || starting">Start</button>
      </div>
    </form>
  </div>
</template>

<style scoped src="./modal.css"></style>
<style scoped>
label {
  margin-top: 12px;
}
.repo {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 34px;
}
.pick {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-weight: 400;
}
select,
#branch {
  height: 32px;
  padding: 0 8px;
  border: 1px solid var(--stroke);
  border-radius: 8px;
  background: var(--bg);
  color: inherit;
  font: inherit;
  font-size: 13px;
}
select {
  margin-left: auto;
}
#branch {
  width: 100%;
}
</style>
