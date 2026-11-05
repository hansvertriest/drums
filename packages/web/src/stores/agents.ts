import type { Agent, AgentId, AgentStatus } from '@drums/protocol';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

export const useAgents = defineStore('agents', () => {
  /** Closed ones too, so their posts still name them. */
  const agents = ref<Agent[]>([]);
  const open = computed(() => agents.value.filter((agent) => !agent.closed));
  const currentId = ref<AgentId>();
  const current = computed(() => open.value.find((agent) => agent.id === currentId.value) ?? open.value[0]);

  const load = (next: Agent[]) => {
    agents.value = next;
    if (!open.value.some((agent) => agent.id === currentId.value)) currentId.value = open.value[0]?.id;
  };
  /** From the request or from the stream, whichever comes first. */
  const add = (agent: Agent) => {
    if (!agents.value.some((a) => a.id === agent.id)) agents.value.push(agent);
  };
  const setStatus = (id: AgentId, status: AgentStatus) => {
    const agent = agents.value.find((a) => a.id === id);
    if (agent) agent.status = status;
  };
  const close = (id: AgentId) => {
    const agent = agents.value.find((a) => a.id === id);
    if (agent) agent.closed = true;
    if (currentId.value === id) currentId.value = open.value[0]?.id;
  };
  const nameOf = (id: AgentId) => agents.value.find((agent) => agent.id === id)?.name ?? '';

  return { agents, open, currentId, current, load, add, setStatus, close, nameOf };
});
