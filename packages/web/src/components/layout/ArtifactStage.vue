<script setup lang="ts">
import type { Answer } from '@drums/protocol';
import { computed, watch } from 'vue';
import { api } from '../../api/client';
import { useAnswers } from '../../stores/answers';
import { useArtifacts } from '../../stores/artifacts';
import { useUi } from '../../stores/ui';
import { useWorkspaces } from '../../stores/workspaces';
import { rendererFor } from '../../renderers';
import ArtifactTabs from '../artifacts/ArtifactTabs.vue';
import VersionPicker from '../artifacts/VersionPicker.vue';

const SAVE_DELAY_MS = 300;

const workspaces = useWorkspaces();
const artifacts = useArtifacts();
const answers = useAnswers();
const ui = useUi();

const renderer = computed(() => (artifacts.current ? rendererFor(artifacts.current.renderer) : undefined));
const frameKey = computed(() =>
  renderer.value?.ownVersions ? `${workspaces.currentId}/${artifacts.currentId}` : `${workspaces.currentId}/${artifacts.currentId}/${artifacts.viewing}`,
);

/**
 * What the frame starts with: on the latest version the answers as they stand now, so a
 * reload keeps them; on an older one what was given then. Read once per version, because
 * the frame itself holds the values after that.
 */
const startingAnswers = computed<Answer[]>(() => {
  const id = artifacts.currentId;
  const set = id ? answers.sets[id] : undefined;
  if (artifacts.isLatest && set && set.version === artifacts.viewing) return set.answers;
  return artifacts.content?.answers ?? [];
});

watch(
  () => [workspaces.currentId, artifacts.currentId, artifacts.viewing] as const,
  async ([ws, id, version]) => {
    if (!ws || !id || !version) return;
    try {
      artifacts.setContent(id, await api.version(ws, id, version));
    } catch (error) {
      ui.report(error);
    }
  },
  { immediate: true },
);

let saveTimer: ReturnType<typeof setTimeout> | undefined;

const sameAnswers = (a: Answer[], b: Answer[]) => JSON.stringify(a) === JSON.stringify(b);

const onAnswers = (next: Answer[]) => {
  const ws = workspaces.currentId;
  const id = artifacts.currentId;
  const version = artifacts.viewing;
  if (!ws || !id || !version || sameAnswers(next, answers.sets[id]?.version === version ? answers.sets[id].answers : [])) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void api.saveAnswers(ws, id, version, next).catch(ui.report), SAVE_DELAY_MS);
};
</script>

<template>
  <main class="stage">
    <p v-if="artifacts.artifacts.length === 0" class="empty">Nothing here yet. What the agents make shows up here.</p>
    <template v-else>
      <ArtifactTabs />
      <VersionPicker v-if="!renderer?.ownVersions" />
      <div class="doc">
        <component
          :is="renderer.component"
          v-if="renderer && (renderer.ownVersions || artifacts.content)"
          :key="frameKey"
          :content="artifacts.content?.content ?? ''"
          :answers="startingAnswers"
          :read-only="!artifacts.isLatest"
          :changes="ui.showChanges"
          @answers="onAnswers"
        />
        <p v-else-if="!artifacts.current" class="empty">Every artifact is archived.</p>
      </div>
    </template>
  </main>
</template>

<style scoped>
.stage {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
.doc {
  flex: 1;
  min-height: 0;
  background: var(--bg);
  border-top: 1px solid var(--line);
}
.empty {
  max-width: 880px;
  margin: 0 auto;
  padding: 40px 24px;
  color: var(--muted);
}
</style>
