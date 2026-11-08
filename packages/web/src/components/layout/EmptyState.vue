<script setup lang="ts">
import AppLogo from './AppLogo.vue';

defineProps<{ title?: string; text: string; logo?: boolean }>();
</script>

<template>
  <div class="empty-state">
    <AppLogo v-if="logo" :size="40" />
    <strong v-if="title">{{ title }}</strong>
    <p>{{ text }}</p>
    <slot />
  </div>
</template>

<style scoped>
.empty-state {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 24px;
  text-align: center;
  color: var(--muted);
}
strong {
  color: var(--ink);
  font-size: 16px;
  font-weight: 600;
}
p {
  max-width: 280px;
  margin: 0;
  font-size: 13.5px;
}
</style>
