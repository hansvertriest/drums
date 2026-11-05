<script setup lang="ts">
defineProps<{ src: string; title: string }>();
</script>

<template>
  <!-- The viewer gets no origin, so nothing of the app is within its reach but its own map routes. -->
  <iframe class="frame" :title="title" sandbox="allow-scripts allow-forms" :src="src" />
</template>

<style scoped>
.frame {
  flex: 1;
  display: block;
  width: 100%;
  min-height: 0;
  border: 0;
  background: var(--bg);
}
</style>
