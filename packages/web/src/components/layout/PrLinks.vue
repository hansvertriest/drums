<script setup lang="ts">
import { useMap } from '../../stores/map';

const map = useMap();
</script>

<template>
  <span class="prs">
    <a v-for="repo in map.opened" :key="repo.name" :href="repo.pr?.url" target="_blank" rel="noopener">{{ map.repos.length > 1 ? repo.name : 'PR ' }}#{{ repo.pr?.number }}</a>
  </span>
</template>

<style scoped>
.prs {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 8px;
  font: 12.5px var(--mono);
}
a {
  color: var(--pr);
  text-decoration: none;
}
</style>
