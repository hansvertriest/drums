<template>
  <aside class="strip" aria-label="Workspaces">
    <div class="list" />
    <button class="new" type="button" disabled>
      <span class="plus" aria-hidden="true">+</span>New workspace
    </button>
  </aside>
</template>

<style scoped>
/* A 60px column that opens over the page on hover, without moving anything. */
.strip {
  position: absolute;
  z-index: 30;
  inset: 60px auto 0 0;
  width: 60px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--surface);
  border-right: 1px solid var(--line);
  transition: width 0.18s;
}
.strip:hover,
.strip:has(:focus-visible) {
  width: 300px;
  box-shadow: 8px 0 32px var(--shadow);
}
@media (prefers-reduced-motion: reduce) {
  .strip {
    transition: none;
  }
}
.list {
  flex: 1;
  overflow: hidden auto;
}
.new {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: none;
  width: 280px;
  margin: 0 10px 12px;
  padding: 4px;
  border: 0;
  border-radius: 10px;
  background: none;
  font-weight: 500;
  text-align: left;
  white-space: nowrap;
}
.plus {
  flex: none;
  width: 32px;
  height: 32px;
  border-radius: 9px;
  background: var(--accent);
  color: var(--on-accent);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
}
</style>
