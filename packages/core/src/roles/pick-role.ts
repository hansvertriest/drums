import type { RoleId } from '@drums/protocol';
import type { RolePick, RolePicker } from '../ports/role-picker.js';
import type { RoleRegistry } from './registry.js';

export interface PickRoleDeps {
  picker: RolePicker;
  roles: RoleRegistry;
  /** Used when the picker returns nothing usable (spec §4.4). */
  fallback: RoleId;
}

/** Add agent: exactly one role for an instruction, chosen from the registry's summaries. */
export async function pickOneRole(
  { picker, roles, fallback }: PickRoleDeps,
  { instruction, overview, hasRepos }: { instruction: string; overview: string; hasRepos: boolean },
): Promise<RolePick> {
  const candidates = roles
    .list()
    .filter((role) => hasRepos || !role.needsRepo)
    .map(({ id, summary }) => ({ id, summary }));
  const picks = await picker
    .pick({ goal: instruction, overview, candidates, hasRepos, exactlyOne: true })
    .catch((): RolePick[] => []);
  const usable = picks.find((pick) => candidates.some((candidate) => candidate.id === pick.role));
  if (!usable) return { role: fallback, instruction };
  return { role: usable.role, instruction: usable.instruction.trim() || instruction };
}
