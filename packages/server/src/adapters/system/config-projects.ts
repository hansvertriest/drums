import { basename } from 'node:path';
import type { Projects } from '@drums/core';
import { RepoName } from '@drums/protocol';

/** The repos in `config.json`, named by their folders. One whose folder can't be a name is left out. */
export function createConfigProjects(paths: readonly string[]): Projects {
  const projects = paths.flatMap((path) => {
    const name = RepoName.safeParse(basename(path));
    return name.success ? [{ name: name.data, path }] : [];
  });
  return { list: () => projects };
}
