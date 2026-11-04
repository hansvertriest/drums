import type {
  AnswerSet,
  ArtifactId,
  ArtifactMeta,
  ArtifactVersion,
  Post,
  PostDraft,
  Step,
  StepDraft,
  VersionNumber,
  Workspace,
  WorkspaceId,
} from '@drums/protocol';

/** All state drums keeps. Files today (spec §8), and all a database would need to implement. */
export interface Store {
  listWorkspaces(): Promise<Workspace[]>;
  getWorkspace(id: WorkspaceId): Promise<Workspace | undefined>;
  createWorkspace(workspace: Workspace): Promise<void>;
  /** Read, change and write, one at a time per workspace. Throws if there is no such workspace. */
  updateWorkspace(id: WorkspaceId, change: (workspace: Workspace) => Workspace): Promise<Workspace>;
  /** The folder an agent of this workspace works in. */
  workspacePath(id: WorkspaceId): string;

  /** Gives the post the next place in the feed. */
  appendPost(workspace: WorkspaceId, post: PostDraft): Promise<Post>;
  listPosts(workspace: WorkspaceId): Promise<Post[]>;

  appendStep(workspace: WorkspaceId, step: StepDraft): Promise<Step>;
  listSteps(workspace: WorkspaceId): Promise<Step[]>;

  /** Gives the artifact the next free id (`a1`, `a2`…). */
  createArtifact(workspace: WorkspaceId, artifact: Omit<ArtifactMeta, 'id'>): Promise<ArtifactMeta>;
  listArtifacts(workspace: WorkspaceId): Promise<ArtifactMeta[]>;
  getArtifact(workspace: WorkspaceId, id: ArtifactId): Promise<ArtifactMeta | undefined>;

  /** False if that version number is taken. Versions are immutable: nothing ever rewrites one. */
  addVersion(workspace: WorkspaceId, artifact: ArtifactId, version: ArtifactVersion, content: string): Promise<boolean>;
  /** Oldest first. */
  listVersions(workspace: WorkspaceId, artifact: ArtifactId): Promise<ArtifactVersion[]>;
  readVersion(workspace: WorkspaceId, artifact: ArtifactId, version: VersionNumber): Promise<string | undefined>;

  getAnswers(workspace: WorkspaceId, artifact: ArtifactId, version: VersionNumber): Promise<AnswerSet | undefined>;
  saveAnswers(workspace: WorkspaceId, set: AnswerSet): Promise<void>;
}
