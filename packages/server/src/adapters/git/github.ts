import { ConflictError, type PullRequests } from '@drums/core';
import { PullRequest } from '@drums/protocol';
import { execa } from 'execa';

const URL_IN_OUTPUT = /https?:\/\/\S+\/pull\/(\d+)/;

async function gh(cwd: string, args: string[], input: string): Promise<string> {
  try {
    const { stdout } = await execa('gh', args, { cwd, input });
    return stdout;
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr?.trim();
    throw new ConflictError(stderr || (error instanceof Error ? error.message : String(error)));
  }
}

/** `PullRequests` via the `gh` found on `PATH`, using its login. The body goes over stdin. */
export function createGhPullRequests(): PullRequests {
  return {
    async open({ worktree, base, head, title, body }) {
      const output = await gh(worktree, ['pr', 'create', '--base', base, '--head', head, '--title', title, '--body-file', '-'], body);
      const match = URL_IN_OUTPUT.exec(output);
      if (!match) throw new ConflictError(`gh didn't say where the PR is: ${output}`);
      return PullRequest.parse({ number: Number(match[1]), url: match[0] });
    },
    async editBody({ worktree, number, body }) {
      await gh(worktree, ['pr', 'edit', String(number), '--body-file', '-'], body);
    },
  };
}
