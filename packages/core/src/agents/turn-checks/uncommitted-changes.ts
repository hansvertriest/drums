import type { TurnCheck } from './turn-check.js';

/** Looks at the worktrees themselves, so it holds for changes made any way at all, the shell included. */
export const uncommittedChanges: TurnCheck = {
  id: 'uncommitted-changes',
  nudge: 'You left changes uncommitted. Commit them now, with a message that says what changed and why.',
  detect: async ({ workspace, role }, { code }) => Boolean(role.needsRepo) && workspace.repos.length > 0 && code.uncommitted(workspace.id),
};
