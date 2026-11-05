import type { AnswerSet, ArtifactMeta, ArtifactVersion, Post, Step, Workspace } from '@drums/protocol';
import type { Store } from '../ports/store.js';

/** The `Store` port without files, for core's tests. */
export function createMemoryStore(): Store {
  const workspaces = new Map<string, Workspace>();
  const posts = new Map<string, Post[]>();
  const steps = new Map<string, Step[]>();
  const artifacts = new Map<string, ArtifactMeta[]>();
  const versions = new Map<string, Array<{ meta: ArtifactVersion; content: string }>>();
  const answers = new Map<string, AnswerSet>();
  const images = new Map<string, Uint8Array>();
  const key = (...parts: Array<string | number>) => parts.join('/');
  const clone = <T>(value: T): T => structuredClone(value);

  return {
    listWorkspaces: async () => [...workspaces.values()].map(clone),
    getWorkspace: async (id) => clone(workspaces.get(id)),
    createWorkspace: async (workspace) => void workspaces.set(workspace.id, clone(workspace)),
    async updateWorkspace(id, change) {
      const current = workspaces.get(id);
      if (!current) throw new Error(`No workspace ${id}`);
      const next = change(clone(current));
      workspaces.set(id, next);
      return clone(next);
    },
    workspacePath: (id) => `/workspaces/${id}`,
    async saveImage(workspace, name, bytes) {
      images.set(key(workspace, name), bytes);
      return `/workspaces/${workspace}/.drums/images/${name}`;
    },
    readImage: async (workspace, name) => images.get(key(workspace, name)),
    async appendPost(workspace, draft) {
      const list = posts.get(workspace) ?? [];
      const post = { ...draft, seq: list.length + 1 } as Post;
      posts.set(workspace, [...list, post]);
      return clone(post);
    },
    listPosts: async (workspace) => clone(posts.get(workspace) ?? []),
    async appendStep(workspace, draft) {
      const list = steps.get(workspace) ?? [];
      const step = { ...draft, seq: list.length + 1 } as Step;
      steps.set(workspace, [...list, step]);
      return clone(step);
    },
    listSteps: async (workspace) => clone(steps.get(workspace) ?? []),
    async createArtifact(workspace, artifact) {
      const list = artifacts.get(workspace) ?? [];
      const meta = { ...artifact, id: `a${list.length + 1}` };
      artifacts.set(workspace, [...list, meta]);
      return clone(meta);
    },
    listArtifacts: async (workspace) => clone(artifacts.get(workspace) ?? []),
    getArtifact: async (workspace, id) => clone(artifacts.get(workspace)?.find((a) => a.id === id)),
    async addVersion(workspace, artifact, meta, content) {
      const list = versions.get(key(workspace, artifact)) ?? [];
      if (list.some((v) => v.meta.version === meta.version)) return false;
      versions.set(key(workspace, artifact), [...list, { meta, content }]);
      return true;
    },
    listVersions: async (workspace, artifact) => clone((versions.get(key(workspace, artifact)) ?? []).map((v) => v.meta)),
    readVersion: async (workspace, artifact, version) =>
      versions.get(key(workspace, artifact))?.find((v) => v.meta.version === version)?.content,
    getAnswers: async (workspace, artifact, version) => clone(answers.get(key(workspace, artifact, version))),
    saveAnswers: async (workspace, set) => void answers.set(key(workspace, set.artifact, set.version), clone(set)),
  };
}
