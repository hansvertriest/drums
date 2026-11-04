import { mkdir, readdir, rm } from 'node:fs/promises';
import type { Store } from '@drums/core';
import { ArtifactMeta, ArtifactVersion } from '@drums/protocol';
import { readJson, readText, toJson, writeAtomic, writeNew } from './files.js';
import type { createPaths } from './paths.js';
import { createTurns } from './turns.js';

type ArtifactStore = Pick<
  Store,
  'createArtifact' | 'listArtifacts' | 'getArtifact' | 'addVersion' | 'listVersions' | 'readVersion'
>;

const listDir = (dir: string) =>
  readdir(dir).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return [] as string[];
    throw error;
  });

/** `a2` before `a10`, `v2.json` before `v10.json`. */
const byNumber = (a: string, b: string) => parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10);

export function createArtifactStore(paths: ReturnType<typeof createPaths>): ArtifactStore {
  const inTurn = createTurns();
  return {
    /** `mkdir` is the claim on an id: it fails if another writer got there first. */
    async createArtifact(workspace, artifact) {
      await mkdir(paths.artifacts(workspace), { recursive: true });
      const taken = (await listDir(paths.artifacts(workspace))).map((name) => Number(name.slice(1)) || 0);
      for (let n = Math.max(0, ...taken) + 1; ; n++) {
        const id = `a${n}`;
        try {
          await mkdir(paths.artifact(workspace, id));
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'EEXIST') continue;
          throw error;
        }
        const meta: ArtifactMeta = { ...artifact, id };
        await writeAtomic(paths.meta(workspace, id), toJson(meta));
        return meta;
      }
    },
    async listArtifacts(workspace) {
      const names = (await listDir(paths.artifacts(workspace))).sort(byNumber);
      const metas = await Promise.all(names.map((id) => readJson(paths.meta(workspace, id), ArtifactMeta)));
      return metas.filter((meta) => meta !== undefined);
    },
    getArtifact: async (workspace, id) => readJson(paths.meta(workspace, id), ArtifactMeta),
    /**
     * `v3.json` is what makes a version exist, so it goes last. An `.html` without one is
     * what a crash between the two writes leaves: never published, so it can be replaced.
     * One writer at a time per artifact, so a racing writer's `.html` is never mistaken for that.
     */
    addVersion: (workspace, id, version, content) =>
      inTurn(`${workspace}/${id}`, async () => {
        const meta = paths.versionMeta(workspace, id, version.version);
        const html = paths.versionHtml(workspace, id, version.version);
        if ((await readText(meta)) !== undefined) return false;
        if (!(await writeNew(html, content))) {
          await rm(html);
          if (!(await writeNew(html, content))) return false;
        }
        return writeNew(meta, toJson(version));
      }),
    async listVersions(workspace, id) {
      const names = (await listDir(paths.artifact(workspace, id))).filter((name) => /^v\d+\.json$/.test(name)).sort(byNumber);
      const dir = paths.artifact(workspace, id);
      const read = await Promise.all(names.map((name) => readJson(`${dir}/${name}`, ArtifactVersion)));
      return read.filter((version) => version !== undefined);
    },
    async readVersion(workspace, id, version) {
      if ((await readText(paths.versionMeta(workspace, id, version))) === undefined) return undefined;
      return readText(paths.versionHtml(workspace, id, version));
    },
  };
}
