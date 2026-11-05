<script setup lang="ts">
import type { Post } from '@drums/protocol';
import { api } from '../../api/client';
import { renderMarkdown } from '../../markdown';
import { useAgents } from '../../stores/agents';
import { useArtifacts } from '../../stores/artifacts';
import { useUi } from '../../stores/ui';
import { useWorkspaces } from '../../stores/workspaces';
import { shortTime } from '../../time';

defineProps<{ post: Post }>();

const agents = useAgents();
const workspaces = useWorkspaces();
const imageUrl = (name: string) => api.imageUrl(workspaces.currentId ?? '', name);
const artifacts = useArtifacts();
const ui = useUi();

/** On phones the stage is another tab, so go there. */
const show = (artifact: string, version?: number) => {
  artifacts.open(artifact, version);
  ui.phoneTab = 'stage';
};
</script>

<template>
  <div v-if="post.kind === 'message'" class="user">
    <span class="who">You · {{ shortTime(post.at) }}</span>
    <button v-if="post.focus" type="button" class="about" @click="show(post.focus.artifact, post.focus.version)">
      About: {{ artifacts.titleOf(post.focus.artifact) }} · v{{ post.focus.version }}
    </button>
    <div v-if="post.text" class="md" v-html="renderMarkdown(post.text)" />
    <div v-if="post.images?.length" class="images">
      <a v-for="name in post.images" :key="name" :href="imageUrl(name)" target="_blank" rel="noopener">
        <img :src="imageUrl(name)" alt="Pasted image" loading="lazy" />
      </a>
    </div>
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
      @click="show(post.artifact)"
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
      @click="show(post.artifact, post.version)"
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
.images {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}
.images img {
  display: block;
  max-width: 220px;
  max-height: 160px;
  border-radius: 8px;
  object-fit: contain;
  background: var(--bg);
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
.post .md {
  margin-top: 6px;
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
