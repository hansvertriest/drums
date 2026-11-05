<script setup lang="ts">
import type { Post } from '@drums/protocol';
import { renderMarkdown } from '../../markdown';
import { useAgents } from '../../stores/agents';
import { useArtifacts } from '../../stores/artifacts';
import { shortTime } from '../../time';

defineProps<{ post: Post }>();

const agents = useAgents();
const artifacts = useArtifacts();
</script>

<template>
  <div v-if="post.kind === 'message'" class="user">
    <span class="who">You · {{ shortTime(post.at) }}</span>
    <button v-if="post.focus" type="button" class="about" @click="artifacts.open(post.focus.artifact, post.focus.version)">
      About: {{ artifacts.titleOf(post.focus.artifact) }} · v{{ post.focus.version }}
    </button>
    <div class="md" v-html="renderMarkdown(post.text)" />
  </div>

  <div v-else-if="post.kind === 'feedback'" class="user">
    <span class="who">You · {{ shortTime(post.at) }}</span>
    <div v-if="post.overall" class="md" v-html="renderMarkdown(post.overall)" />
    <p v-for="block in post.code ?? []" :key="block.repo" class="sent-code">
      {{ block.comments }} comment{{ block.comments === 1 ? '' : 's' }} on {{ block.repo }}
    </p>
    <ul>
      <template v-for="item in post.items" :key="item.artifact">
        <li v-for="answer in item.answers" :key="answer.name">
          {{ answer.label }}: <b>{{ answer.value }}</b>
        </li>
      </template>
    </ul>
  </div>

  <article v-else class="post">
    <header>
      <span class="by">{{ agents.nameOf(post.agent) }}</span>
      <time>{{ shortTime(post.at) }}</time>
    </header>
    <h3>{{ post.title }}</h3>
    <div class="md" v-html="renderMarkdown(post.message)" />
    <button
      v-if="post.kind === 'checkpoint'"
      type="button"
      class="open"
      :aria-label="`Open the branch map at ${post.title}`"
      @click="artifacts.open(post.artifact)"
    >
      <span v-for="repo in post.repos" :key="repo.name">
        {{ repo.name }} · {{ repo.files }} file{{ repo.files === 1 ? '' : 's' }}
        <span class="a">+{{ repo.additions }}</span> <span class="d">−{{ repo.deletions }}</span>
      </span>
      <span class="go" aria-hidden="true">→</span>
    </button>
    <button
      v-if="post.kind === 'version'"
      type="button"
      class="open"
      :aria-label="`Open ${post.title} v${post.version}`"
      @click="artifacts.open(post.artifact, post.version)"
    >
      <span>{{ post.title }}</span>
      <code>v{{ post.version }}</code>
      <span class="go" aria-hidden="true">→</span>
    </button>
  </article>
</template>

<style scoped>
.user {
  align-self: flex-end;
  max-width: 92%;
  padding: 9px 12px;
  border-radius: 12px 12px 4px 12px;
  background: var(--accent-soft);
  overflow-wrap: anywhere;
}
.user ul {
  margin: 6px 0 0;
  padding-left: 16px;
  font-size: 13px;
}
.who {
  display: block;
  margin-bottom: 2px;
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--muted);
}
.about {
  display: block;
  margin-bottom: 4px;
  padding: 0;
  border: 0;
  background: none;
  font-size: 12px;
  color: var(--accent);
  text-align: left;
}
.post {
  padding: 11px 13px 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--bg);
  overflow-wrap: anywhere;
}
.post header {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.by {
  flex: 1;
  font: 600 11px var(--sans);
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--muted);
}
time {
  font-size: 12px;
  color: var(--muted);
}
h3 {
  margin: 2px 0 0;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.35;
}
.md {
  font-size: 13.5px;
  line-height: 1.55;
}
.md :deep(p) {
  margin: 6px 0 0;
}
.user .md :deep(p:first-child) {
  margin-top: 0;
}
.md :deep(ul) {
  margin: 6px 0 0;
  padding-left: 18px;
}
.md :deep(code) {
  padding: 0 3px;
  border-radius: 4px;
  background: var(--surface-2);
  font-family: var(--mono);
  font-size: 0.9em;
}
.sent-code {
  margin: 4px 0 0;
  font-size: 13px;
}
.a {
  color: var(--add);
}
.d {
  color: var(--del);
}
.open {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  width: 100%;
  margin-top: 10px;
  padding: 7px 10px;
  border: 1px solid var(--stroke);
  border-radius: 9px;
  background: var(--surface);
  font-size: 12.5px;
  text-align: left;
}
.open:hover {
  border-color: var(--accent);
}
.open code {
  font-family: var(--mono);
}
.go {
  margin-left: auto;
  font-weight: 500;
  color: var(--accent);
}
</style>
