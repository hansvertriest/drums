import type { Answer, AnswerSet, ArtifactId } from '@drums/protocol';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

/** The latest version's answers per artifact. Only those without `sentAt` are pending. */
export const useAnswers = defineStore('answers', () => {
  const sets = ref<Record<ArtifactId, AnswerSet>>({});

  const load = (next: AnswerSet[]) => {
    sets.value = Object.fromEntries(next.map((set) => [set.artifact, set]));
  };
  const set = (next: AnswerSet) => {
    sets.value[next.artifact] = next;
  };

  const pendingFor = (id: ArtifactId): Answer[] => {
    const entry = sets.value[id];
    return entry && !entry.sentAt ? entry.answers : [];
  };
  const pendingCount = computed(() => Object.keys(sets.value).reduce((total, id) => total + pendingFor(id).length, 0));

  return { sets, load, set, pendingFor, pendingCount };
});
