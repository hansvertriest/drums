<script setup lang="ts">
import { useWorkspaces } from '../../stores/workspaces';

const workspaces = useWorkspaces();
</script>

<template>
  <header class="header">
    <span class="logo-cell">
      <span class="logo" role="img" aria-label="drums">d</span>
    </span>
    <div class="title">
      <h1>{{ workspaces.current?.goal ?? 'drums' }}</h1>
      <p>{{ workspaces.current ? '' : 'No workspace' }}</p>
    </div>
    <button class="send" type="button" disabled>Send <span class="count">0</span></button>
  </header>
</template>

<style scoped>
.header {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: none;
  height: 60px;
  padding-right: 20px;
  background: var(--surface);
  border-bottom: 1px solid var(--line);
}
.logo-cell {
  flex: none;
  align-self: stretch;
  width: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-right: 1px solid var(--line);
}
.logo {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--ink);
  color: var(--bg);
  display: flex;
  align-items: center;
  justify-content: center;
  font: 600 16px var(--mono);
}
.title {
  flex: 1;
  min-width: 0;
}
.title h1 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.3;
}
.title p {
  margin: 2px 0 0;
  font-size: 12.5px;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.send {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 36px;
  padding: 0 12px;
  border: 1px solid var(--stroke);
  border-radius: 10px;
  background: var(--surface);
  font-weight: 500;
}
.send:disabled {
  opacity: 0.45;
}
.count {
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--muted);
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
</style>
