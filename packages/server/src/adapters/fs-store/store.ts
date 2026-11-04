import { readdir, mkdir } from 'node:fs/promises';
import type { Store } from '@drums/core';
import { AnswerSet, Post, Step, Workspace, WorkspaceId } from '@drums/protocol';
import { createArtifactStore } from './artifacts.js';
import { readJson, toJson, writeAtomic, writeNew } from './files.js';
import { createPaths } from './paths.js';
import { createSequence } from './sequence.js';
import { createTurns } from './turns.js';

/** The `Store` port on files, per spec §8. */
export function createFsStore(workspacesRoot: string): Store {
  const paths = createPaths(workspacesRoot);
  /** One at a time per workspace, so concurrent read-change-writes don't lose each other's changes. */
  const inTurn = createTurns();

  const posts = (workspace: string) => createSequence(() => paths.posts(workspace), Post);
  const steps = (workspace: string) => createSequence(() => paths.steps(workspace), Step);

  const getWorkspace: Store['getWorkspace'] = async (id) => readJson(paths.workspaceFile(id), Workspace);

  return {
    async listWorkspaces() {
      const names = await readdir(workspacesRoot).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return [] as string[];
        throw error;
      });
      const valid = names.filter((name) => WorkspaceId.safeParse(name).success);
      const read = await Promise.all(valid.map((name) => getWorkspace(name)));
      return read.filter((workspace) => workspace !== undefined);
    },
    getWorkspace,
    async createWorkspace(workspace) {
      await mkdir(paths.workspace(workspace.id), { recursive: true });
      if (!(await writeNew(paths.workspaceFile(workspace.id), toJson(workspace)))) {
        throw new Error(`Workspace ${workspace.id} already exists`);
      }
    },
    updateWorkspace: (id, change) =>
      inTurn(id, async () => {
        const current = await getWorkspace(id);
        if (!current) throw new Error(`No workspace ${id}`);
        const next = Workspace.parse(change(current));
        await writeAtomic(paths.workspaceFile(id), toJson(next));
        return next;
      }),
    workspacePath: (id) => paths.workspace(id),

    appendPost: (workspace, draft) => posts(workspace).append(draft as never),
    listPosts: (workspace) => posts(workspace).list(),
    appendStep: (workspace, draft) => steps(workspace).append(draft as never),
    listSteps: (workspace) => steps(workspace).list(),

    ...createArtifactStore(paths),

    getAnswers: (workspace, artifact, version) => readJson(paths.answers(workspace, artifact, version), AnswerSet),
    saveAnswers: (workspace, set) => writeAtomic(paths.answers(workspace, set.artifact, set.version), toJson(set)),
  };
}
