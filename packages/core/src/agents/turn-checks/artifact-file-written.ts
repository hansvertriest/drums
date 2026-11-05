import type { TurnCheck } from './turn-check.js';

const ARTIFACT_FILE = /\.html?$/i;

/** Artifacts are HTML (spec §5.1). HTML inside an attached repo is that repo's code. */
const isArtifactFile = (path: string, repos: ReadonlyArray<{ name: string }>) =>
  ARTIFACT_FILE.test(path) && !repos.some(({ name }) => path.startsWith(`${name}/`));

/** The agent wrote what looks like an artifact to a file, where nobody will see it, and posted no version of any artifact. */
export const artifactFileWritten: TurnCheck = {
  id: 'artifact-file-written',
  nudge: 'You wrote an HTML file, and the user only sees artifacts. If it is one, post it with artifact_update, or artifact_create if it is new.',
  detect: async ({ workspace, writes, posts }) =>
    writes.some((path) => isArtifactFile(path, workspace.repos)) && !posts.some((post) => post.kind === 'version'),
};
