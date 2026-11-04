/** A lookup over a list of modules. Roles, tools and artifact kinds all use it. */
export interface Registry<T extends { id: string }> {
  get(id: string): T;
  has(id: string): boolean;
  list(): readonly T[];
}

export function createRegistry<T extends { id: string }>(label: string, entries: readonly T[]): Registry<T> {
  const byId = new Map<string, T>();
  for (const entry of entries) {
    if (byId.has(entry.id)) throw new Error(`Duplicate ${label}: ${entry.id}`);
    byId.set(entry.id, entry);
  }
  return {
    get(id) {
      const entry = byId.get(id);
      if (!entry) throw new Error(`Unknown ${label}: ${id}`);
      return entry;
    },
    has: (id) => byId.has(id),
    list: () => [...byId.values()],
  };
}
