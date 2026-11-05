import { join } from 'node:path';
import { ArtifactId, ImageName, WorkspaceId, type VersionNumber } from '@drums/protocol';

/** The layout of spec §8, in one place. Ids are checked here too, as they become paths. */
export function createPaths(root: string) {
  const workspace = (id: string) => join(root, WorkspaceId.parse(id));
  const data = (id: string) => join(workspace(id), '.drums');
  const artifacts = (ws: string) => join(data(ws), 'artifacts');
  const artifact = (ws: string, id: string) => join(artifacts(ws), ArtifactId.parse(id));
  return {
    root,
    workspace,
    workspaceFile: (id: string) => join(data(id), 'workspace.json'),
    posts: (id: string) => join(data(id), 'posts'),
    steps: (id: string) => join(data(id), 'steps'),
    image: (id: string, name: string) => join(data(id), 'images', ImageName.parse(name)),
    artifacts,
    artifact,
    meta: (ws: string, id: string) => join(artifact(ws, id), 'meta.json'),
    versionHtml: (ws: string, id: string, v: VersionNumber) => join(artifact(ws, id), `v${v}.html`),
    versionMeta: (ws: string, id: string, v: VersionNumber) => join(artifact(ws, id), `v${v}.json`),
    answers: (ws: string, id: string, v: VersionNumber) => join(data(ws), 'answers', `${ArtifactId.parse(id)}-v${v}.json`),
  };
}
