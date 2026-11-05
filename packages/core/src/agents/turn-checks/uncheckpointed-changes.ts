import type { TurnCheck } from './turn-check.js';

/** Compares the worktrees with the last checkpoint, so it holds for changes made any way at all, the shell included. */
export const uncheckpointedChanges: TurnCheck = {
  id: 'uncheckpointed-changes',
  nudge: 'You changed files and have posted no checkpoint since. Call checkpoint now.',
  detect: async ({ workspace, role }, { code }) =>
    role.tools.includes('checkpoint') && workspace.repos.length > 0 && code.uncheckpointed(workspace.id),
  async whenIgnored({ workspace, agent }, { code }) {
    await code.checkpoint(workspace.id, agent.id, {
      title: 'Uncheckpointed changes',
      message: 'Posted by drums: the turn ended with changes and no checkpoint, also after a reminder. Nobody has described these yet.',
    });
  },
};
