<script setup lang="ts">
import type { PermissionRequest, Post, Step } from '@drums/protocol';
import { computed, nextTick, ref, watch } from 'vue';
import { renderMarkdown } from '../../markdown';
import { useAgents } from '../../stores/agents';
import { useThreads } from '../../stores/threads';
import { useUi } from '../../stores/ui';
import PermissionRow from './PermissionRow.vue';
import PostCard from './PostCard.vue';

const threads = useThreads();
const agents = useAgents();
const ui = useUi();
const list = ref<HTMLElement>();

type Item =
  | { key: string; at: string; post: Post; step?: undefined; permission?: undefined }
  | { key: string; at: string; step: Step; post?: undefined; permission?: undefined }
  | { key: string; at: string; permission: PermissionRequest; post?: undefined; step?: undefined };

/** Posts and steps by time. What the agent says and does only with Steps on; errors and permission requests always need the user. */
const items = computed<Item[]>(() => {
  const agent = agents.current?.id;
  const posts: Item[] = threads.posts.filter((p) => p.agent === agent).map((post) => ({ key: `p${post.seq}`, at: post.at, post }));
  const steps: Item[] = threads.steps
    .filter((s) => s.agent === agent && (s.kind === 'error' || ui.showSteps))
    .map((step) => ({ key: `s${step.seq}`, at: step.at, step }));
  const permissions: Item[] = threads.permissions
    .filter((request) => request.agent === agent)
    .map((permission) => ({ key: `r${permission.id}`, at: permission.at, permission }));
  return [...posts, ...steps, ...permissions].sort((a, b) => a.at.localeCompare(b.at));
});

const nearEnd = () => {
  const el = list.value;
  return !el || el.scrollHeight - el.scrollTop - el.clientHeight < 60;
};

watch(
  () => items.value.length,
  () => {
    const follow = nearEnd();
    void nextTick(() => {
      if (follow && list.value) list.value.scrollTop = list.value.scrollHeight;
    });
  },
);
</script>

<template>
  <div ref="list" class="thread">
    <template v-for="item in items" :key="item.key">
      <PostCard v-if="item.post" :post="item.post" />
      <PermissionRow v-else-if="item.permission" :request="item.permission" />
      <div v-else-if="item.step?.kind === 'tool'" class="tool">
        <span>›</span><span><b>{{ item.step.tool }}</b> {{ item.step.summary }}</span>
      </div>
      <div v-else-if="item.step?.kind === 'text'" class="text md" v-html="renderMarkdown(item.step.text)" />
      <p v-else-if="item.step?.kind === 'error'" class="error" role="alert">{{ item.step.text }}</p>
    </template>
  </div>
</template>

<style scoped>
.thread {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 10px 16px 16px;
  overflow: auto;
}
.thread > * {
  flex: none;
}
.tool {
  display: flex;
  gap: 7px;
  padding-left: 4px;
  overflow: hidden;
  font: 12px var(--mono);
  color: var(--muted);
  white-space: nowrap;
  text-overflow: ellipsis;
}
.tool b {
  font-weight: 500;
  color: var(--ink);
}
.text {
  padding: 2px 0 2px 11px;
  border-left: 2px solid var(--line);
  overflow-wrap: anywhere;
}
.error {
  margin: 0;
  padding: 7px 12px;
  border-radius: 9px;
  background: var(--del-bg);
  color: var(--del);
  font-size: 12.5px;
  overflow-wrap: anywhere;
}
</style>
