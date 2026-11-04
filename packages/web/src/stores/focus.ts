import type { Focus } from '@drums/protocol';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { useArtifacts } from './artifacts';

const keyOf = ({ artifact, version }: Focus) => `${artifact}/${version}`;

/** What goes along with a message: what is on the stage, until the user removes it. */
export const useFocus = defineStore('focus', () => {
  const artifacts = useArtifacts();
  /** Removing it holds for what is on screen now. Looking at something else brings the chip back. */
  const removed = ref<string>();

  const onStage = computed<Focus | undefined>(() => {
    const artifact = artifacts.currentId;
    const version = artifacts.viewing;
    return artifact !== undefined && version !== undefined ? { artifact, version } : undefined;
  });
  const focus = computed(() => (onStage.value && keyOf(onStage.value) !== removed.value ? onStage.value : undefined));

  const remove = () => {
    removed.value = onStage.value && keyOf(onStage.value);
  };

  return { focus, remove };
});
