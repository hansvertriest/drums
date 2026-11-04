<script setup lang="ts">
defineProps<{ content: string }>();
</script>

<template>
  <pre>{{ content }}</pre>
</template>
