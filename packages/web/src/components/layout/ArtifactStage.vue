<template>
  <main class="stage">
    <p class="empty">Nothing here yet. What the agents make shows up here.</p>
  </main>
</template>

<style scoped>
.stage {
  flex: 1;
  min-height: 0;
  margin-left: 60px;
  overflow: auto;
}
.empty {
  max-width: 880px;
  margin: 0 auto;
  padding: 40px 24px;
  color: var(--muted);
}
</style>
