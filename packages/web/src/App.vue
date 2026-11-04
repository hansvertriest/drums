<script setup lang="ts">
import AppHeader from './components/layout/AppHeader.vue';
import ArtifactStage from './components/layout/ArtifactStage.vue';
import WorkspaceStrip from './components/layout/WorkspaceStrip.vue';
</script>

<template>
  <div class="app">
    <AppHeader />
    <WorkspaceStrip />
    <ArtifactStage />
  </div>
</template>

<style scoped>
.app {
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
}
</style>
