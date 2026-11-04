<script setup lang="ts">
import AgentTabs from '../chat/AgentTabs.vue';
import Composer from '../chat/Composer.vue';
import Thread from '../chat/Thread.vue';
</script>

<template>
  <section class="rail" aria-label="Chat">
    <AgentTabs />
    <Thread />
    <Composer />
  </section>
</template>

<style scoped>
.rail {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-right: 1px solid var(--line);
  background: var(--surface);
}
</style>
