import type { RoleId } from '@drums/protocol';
import type { RoleCandidate, RolePick, RolePicker } from '../ports/role-picker.js';
import type { RoleRegistry } from './registry.js';

export interface PickRoleDeps {
  picker: RolePicker;
  roles: RoleRegistry;
  /** Used when the picker returns nothing usable, or fails (spec §4.4). */
  fallback: RoleId;
}

/** From the registry's summaries, so a new role is picked up by itself. A role that needs a repo only with repos attached. */
const candidatesFor = (roles: RoleRegistry, hasRepos: boolean): RoleCandidate[] =>
  roles
    .list()
    .filter((role) => hasRepos || !role.needsRepo)
    .map(({ id, summary }) => ({ id, summary }));

/** Only candidates, one agent per role, and an instruction to work from whatever the model wrote. */
function usablePicks(picks: readonly RolePick[], candidates: readonly RoleCandidate[], instruction: string): RolePick[] {
  const seen = new Set<RoleId>();
  return picks.flatMap((pick) => {
    if (seen.has(pick.role) || !candidates.some((candidate) => candidate.id === pick.role)) return [];
    seen.add(pick.role);
    return [{ role: pick.role, instruction: pick.instruction.trim() || instruction }];
  });
}

/** New workspace: the roles a goal needs, from the same call that Add agent uses. */
export async function pickRoles({ picker, roles, fallback }: PickRoleDeps, { goal, hasRepos }: { goal: string; hasRepos: boolean }): Promise<RolePick[]> {
  const candidates = candidatesFor(roles, hasRepos);
  const picks = await picker.pick({ goal, candidates, hasRepos }).catch((): RolePick[] => []);
  const usable = usablePicks(picks, candidates, goal);
  return usable.length > 0 ? usable : [{ role: fallback, instruction: goal }];
}

/** Add agent: exactly one role for an instruction, given where the workspace stands. */
export async function pickOneRole(
  { picker, roles, fallback }: PickRoleDeps,
  { instruction, overview, hasRepos }: { instruction: string; overview: string; hasRepos: boolean },
): Promise<RolePick> {
  const candidates = candidatesFor(roles, hasRepos);
  const picks = await picker.pick({ goal: instruction, overview, candidates, hasRepos, exactlyOne: true }).catch((): RolePick[] => []);
  return usablePicks(picks, candidates, instruction)[0] ?? { role: fallback, instruction };
}
