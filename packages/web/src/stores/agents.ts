import type { Agent, AgentId, AgentStatus } from '@drums/protocol';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

export const useAgents = defineStore('agents', () => {
  const agents = ref<Agent[]>([]);
  const currentId = ref<AgentId>();
  const current = computed(() => agents.value.find((agent) => agent.id === currentId.value) ?? agents.value[0]);

  const load = (next: Agent[]) => {
    agents.value = next;
    if (!next.some((agent) => agent.id === currentId.value)) currentId.value = next[0]?.id;
  };
  const setStatus = (id: AgentId, status: AgentStatus) => {
    const agent = agents.value.find((a) => a.id === id);
    if (agent) agent.status = status;
  };
  const nameOf = (id: AgentId) => agents.value.find((agent) => agent.id === id)?.name ?? '';

  return { agents, currentId, current, load, setStatus, nameOf };
});
