import type { Agent, AgentId } from '@drums/protocol';
import { ConflictError } from '../errors.js';

const workingMessage = (names: string[]) => {
  const [verb, pronoun] = names.length === 1 ? ['is', 'it'] : ['are', 'them'];
  return `${names.join(' and ')} ${verb} working. Wait for ${pronoun} to finish, or stop ${pronoun}.`;
};

export type AgentClaims = ReturnType<typeof createAgentClaims>;

/** Who holds an agent right now. An agent takes one message at a time, from the check to the end of its turn. */
export function createAgentClaims() {
  const busy = new Set<AgentId>();
  return {
    has: (id: AgentId) => busy.has(id),
    add: (id: AgentId) => void busy.add(id),
    /** True if it was held. */
    release: (id: AgentId) => busy.delete(id),
    clear: () => busy.clear(),
    /** Synchronous from the check to the claim, so two callers can never both hold an agent. */
    claim(agent: Agent) {
      if (busy.has(agent.id)) throw new ConflictError(workingMessage([agent.name]));
      busy.add(agent.id);
    },
    /** All or none. */
    claimAll(agents: readonly Agent[]) {
      const running = agents.filter((agent) => busy.has(agent.id));
      if (running.length > 0) throw new ConflictError(workingMessage(running.map((agent) => agent.name)));
      for (const agent of agents) busy.add(agent.id);
    },
    /** If the work that goes with a claim fails, the agent is free again. */
    async whilePreparing<T>(id: AgentId, prepare: () => Promise<T>) {
      try {
        return await prepare();
      } catch (error) {
        busy.delete(id);
        throw error;
      }
    },
  };
}
