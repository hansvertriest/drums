import type { PermissionRequest, Post, Step } from '@drums/protocol';
import { defineStore } from 'pinia';
import { ref } from 'vue';

/** A list keyed by `seq`: an event that arrives twice, or after a reload, lands once. */
function upsert<T extends { seq: number }>(list: T[], item: T): void {
  if (!list.some((entry) => entry.seq === item.seq)) list.push(item);
}

export const useThreads = defineStore('threads', () => {
  const posts = ref<Post[]>([]);
  const steps = ref<Step[]>([]);
  const permissions = ref<PermissionRequest[]>([]);

  const load = (nextPosts: Post[], nextSteps: Step[], nextPermissions: PermissionRequest[] = []) => {
    posts.value = nextPosts;
    steps.value = nextSteps;
    permissions.value = nextPermissions;
  };

  const setPermission = (request: PermissionRequest) => {
    const index = permissions.value.findIndex((entry) => entry.id === request.id);
    if (index < 0) permissions.value.push(request);
    else permissions.value[index] = request;
  };

  return {
    posts,
    steps,
    permissions,
    load,
    setPermission,
    addPost: (post: Post) => upsert(posts.value, post),
    addStep: (step: Step) => upsert(steps.value, step),
  };
});
