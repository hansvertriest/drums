<script setup lang="ts">
withDefaults(defineProps<{ size?: number }>(), { size: 26 });
</script>

<template>
  <svg class="logo" role="img" aria-label="drums" viewBox="0 0 100 100" :width="size" :height="size">
    <circle cx="42" cy="62" r="24" fill="none" stroke="currentColor" stroke-width="10" />
    <circle cx="42" cy="62" r="6.5" fill="currentColor" />
    <path d="M69 86L76 24" stroke="currentColor" stroke-width="9" stroke-linecap="round" />
    <circle cx="77" cy="15" r="9" fill="currentColor" />
  </svg>
</template>

<style scoped>
.logo {
  flex: none;
  display: block;
}
</style>
