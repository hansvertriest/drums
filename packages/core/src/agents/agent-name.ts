import type { Agent } from '@drums/protocol';

/** Two agents of one role need different tabs: `Scoper`, then `Scoper 2`. */
export function uniqueAgentName(name: string, others: readonly Agent[]): string {
  const taken = new Set(others.map((agent) => agent.name));
  if (!taken.has(name)) return name;
  for (let n = 2; ; n++) {
    const candidate = `${name} ${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}
