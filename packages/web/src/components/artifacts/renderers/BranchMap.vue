<script setup lang="ts">
import { useMap } from '../../../stores/map';
import MapFrame from '../../map/MapFrame.vue';

defineOptions({ inheritAttrs: false });

const map = useMap();
</script>

<template>
  <div class="map">
    <div v-if="map.repos.length > 1" class="repos" role="tablist" aria-label="Repos">
      <button
        v-for="repo in map.repos"
        :key="repo.name"
        type="button"
        role="tab"
        :aria-selected="repo.name === map.current?.name"
        :class="{ on: repo.name === map.current?.name }"
        @click="map.shown = repo.name"
      >
        {{ repo.name }} <small><span class="a">+{{ repo.additions }}</span> <span class="d">−{{ repo.deletions }}</span></small>
      </button>
    </div>
    <p v-if="map.current?.error" class="failed" role="alert">{{ map.current.error }}</p>
    <MapFrame v-else-if="map.current?.viewer" :key="map.current.viewer" :src="map.current.viewer" :title="`Branch map of ${map.current.name}`" />
    <p v-else class="failed">Starting the map…</p>
  </div>
</template>

<style scoped>
.map {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.repos {
  display: flex;
  flex: none;
  gap: 4px;
  padding: 6px 12px;
  overflow-x: auto;
  background: var(--surface);
}
.repos button {
  flex: none;
  height: 28px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: none;
  font-size: 12.5px;
  color: var(--muted);
}
.repos button.on {
  border-color: var(--stroke);
  background: var(--bg);
  color: var(--ink);
}
small {
  font: 11.5px var(--mono);
}
.a {
  color: var(--add);
}
.d {
  color: var(--del);
}
.failed {
  margin: 0;
  padding: 24px;
  color: var(--muted);
  overflow-wrap: anywhere;
}
</style>
