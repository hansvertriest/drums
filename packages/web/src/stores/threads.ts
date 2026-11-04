import type { Post, Step } from '@drums/protocol';
import { defineStore } from 'pinia';
import { ref } from 'vue';

/** A list keyed by `seq`: an event that arrives twice, or after a reload, lands once. */
function upsert<T extends { seq: number }>(list: T[], item: T): void {
  if (!list.some((entry) => entry.seq === item.seq)) list.push(item);
}

export const useThreads = defineStore('threads', () => {
  const posts = ref<Post[]>([]);
  const steps = ref<Step[]>([]);

  const load = (nextPosts: Post[], nextSteps: Step[]) => {
    posts.value = nextPosts;
    steps.value = nextSteps;
  };

  return {
    posts,
    steps,
    load,
    addPost: (post: Post) => upsert(posts.value, post),
    addStep: (step: Step) => upsert(steps.value, step),
  };
});
