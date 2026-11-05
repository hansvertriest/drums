import type {
  AgentId,
  Artifact,
  ArtifactId,
  ArtifactKindId,
  ArtifactMeta,
  ArtifactVersion,
  PostDraft,
  VersionNumber,
  WorkspaceId,
} from '@drums/protocol';
import { createTurns } from '../concurrency/turns.js';
import { InvalidError, NotFoundError } from '../errors.js';
import type { EventBus } from '../events/event-bus.js';
import type { Clock } from '../ports/clock.js';
import type { Store } from '../ports/store.js';
import type { PostService, WithoutPlace } from '../posts/post-service.js';
import type { ArtifactKindRegistry } from './registry.js';

export interface VersionContent extends ArtifactVersion {
  content: string;
}

export type UpdateResult =
  | { status: 'ok'; version: VersionNumber }
  /** `base_version` was not the latest: the agent merges into `latest` and retries. */
  | { status: 'conflict'; latest: VersionContent };

export interface ArtifactService {
  list(workspace: WorkspaceId): Promise<Artifact[]>;
  get(workspace: WorkspaceId, id: ArtifactId): Promise<Artifact>;
  /** The latest version if none is named. */
  read(workspace: WorkspaceId, id: ArtifactId, version?: VersionNumber): Promise<VersionContent>;
  create(
    workspace: WorkspaceId,
    agent: AgentId,
    input: { title: string; content: string; note: string; kind?: ArtifactKindId },
  ): Promise<{ id: ArtifactId; version: VersionNumber }>;
  update(
    workspace: WorkspaceId,
    agent: AgentId,
    input: { id: ArtifactId; baseVersion: VersionNumber; content: string; note: string },
  ): Promise<UpdateResult>;
  /** An artifact with no version yet, for a kind that has something to show without one. */
  createEmpty(workspace: WorkspaceId, input: { title: string; kind: ArtifactKindId }): Promise<ArtifactMeta>;
  /** A version from drums itself, for a `managed` kind. `post` makes its thread entry. */
  record(
    workspace: WorkspaceId,
    agent: AgentId,
    input: { id: ArtifactId; content: string; note: string; post(version: VersionNumber): ArtifactPost },
  ): Promise<{ version: VersionNumber }>;
  /**
   * One at a time per workspace: new versions, and whatever depends on which version is the
   * latest. Don't call `create` or `update` inside it: they take the same turn.
   */
  exclusive<T>(workspace: WorkspaceId, work: () => Promise<T>): Promise<T>;
  setArchived(workspace: WorkspaceId, id: ArtifactId, archived: boolean): Promise<Artifact>;
}

/** A version's thread entry, without what the post service adds. */
export type ArtifactPost = WithoutPlace<Extract<PostDraft, { kind: 'version' | 'checkpoint' }>>;

export interface ArtifactServiceDeps {
  store: Store;
  events: EventBus;
  clock: Clock;
  kinds: ArtifactKindRegistry;
  posts: PostService;
  /** Called with the version a new one replaces, before anyone hears of the new one. */
  onNewVersion?(workspace: WorkspaceId, artifact: ArtifactId, previous: VersionNumber, next: VersionNumber): Promise<void>;
}

export function createArtifactService(deps: ArtifactServiceDeps): ArtifactService {
  const { store, events, clock, kinds, posts } = deps;
  const exclusive = createTurns();

  const archivedIn = async (workspace: WorkspaceId) => (await store.getWorkspace(workspace))?.archivedArtifacts ?? [];

  const view = async (workspace: WorkspaceId, meta: ArtifactMeta, archived?: readonly ArtifactId[]): Promise<Artifact> => ({
    ...meta,
    renderer: kinds.get(meta.kind).renderer,
    versions: await store.listVersions(workspace, meta.id),
    ...((archived ?? (await archivedIn(workspace))).includes(meta.id) ? { archived: true } : {}),
  });

  const writeArchived = (workspace: WorkspaceId, id: ArtifactId, archived: boolean) =>
    store.updateWorkspace(workspace, (w) => ({
      ...w,
      archivedArtifacts: [...(w.archivedArtifacts ?? []).filter((other) => other !== id), ...(archived ? [id] : [])],
    }));

  const metaOf = async (workspace: WorkspaceId, id: ArtifactId) => {
    const meta = await store.getArtifact(workspace, id);
    if (!meta) throw new NotFoundError(`No artifact ${id}.`);
    return meta;
  };

  const read: ArtifactService['read'] = async (workspace, id, requested) => {
    const versions = await store.listVersions(workspace, (await metaOf(workspace, id)).id);
    const version = requested === undefined ? versions.at(-1) : versions.find((v) => v.version === requested);
    const content = version && (await store.readVersion(workspace, id, version.version));
    if (!version || content === undefined) throw new NotFoundError(`Artifact ${id} has no version ${requested ?? 'yet'}.`);
    return { ...version, content };
  };

  /** Stores the version, then tells the thread and the page. False if the number was taken. */
  const publish = async (
    workspace: WorkspaceId,
    agent: AgentId,
    meta: ArtifactMeta,
    number: VersionNumber,
    content: string,
    note: string,
    post: ArtifactPost = { kind: 'version', title: meta.title, message: note, artifact: meta.id, version: number },
  ) => {
    const version: ArtifactVersion = { version: number, by: agent, note, at: clock.now().toISOString() };
    if (!(await store.addVersion(workspace, meta.id, version, content))) return false;
    if ((await archivedIn(workspace)).includes(meta.id)) await writeArchived(workspace, meta.id, false);
    if (number > 1) await deps.onNewVersion?.(workspace, meta.id, number - 1, number);
    await posts.add(workspace, agent, post);
    events.emit({ type: 'artifact.version', workspace, artifact: await view(workspace, meta), version: number });
    return true;
  };

  return {
    async list(workspace) {
      const [metas, archived] = await Promise.all([store.listArtifacts(workspace), archivedIn(workspace)]);
      const views = await Promise.all(metas.map((meta) => view(workspace, meta, archived)));
      // One being created right now has no version yet, and nothing to show.
      return views.filter((artifact) => artifact.versions.length > 0 || kinds.get(artifact.kind).showsWithoutVersions);
    },
    get: async (workspace, id) => view(workspace, await metaOf(workspace, id)),
    read,
    async create(workspace, agent, { title, content, note, kind }) {
      const definition = kinds.get(kind ?? kinds.list()[0]!.id);
      definition.validate(content);
      return exclusive(workspace, async () => {
        const meta = await store.createArtifact(workspace, { title, kind: definition.id, createdAt: clock.now().toISOString() });
        await publish(workspace, agent, meta, 1, content, note);
        return { id: meta.id, version: 1 };
      });
    },
    async update(workspace, agent, { id, baseVersion, content, note }) {
      const meta = await metaOf(workspace, id);
      const definition = kinds.get(meta.kind);
      if (definition.managed) throw new InvalidError(definition.managed);
      definition.validate(content);
      return exclusive(workspace, async (): Promise<UpdateResult> => {
        const latest = await read(workspace, id);
        if (latest.version === baseVersion && (await publish(workspace, agent, meta, baseVersion + 1, content, note))) {
          return { status: 'ok', version: baseVersion + 1 };
        }
        return { status: 'conflict', latest: await read(workspace, id) };
      });
    },
    createEmpty: (workspace, { title, kind }) => store.createArtifact(workspace, { title, kind, createdAt: clock.now().toISOString() }),
    async record(workspace, agent, { id, content, note, post }) {
      const meta = await metaOf(workspace, id);
      kinds.get(meta.kind).validate(content);
      return exclusive(workspace, async () => {
        const version = ((await store.listVersions(workspace, id)).at(-1)?.version ?? 0) + 1;
        await publish(workspace, agent, meta, version, content, note, post(version));
        return { version };
      });
    },
    exclusive,
    async setArchived(workspace, id, archived) {
      const meta = await metaOf(workspace, id);
      const artifact = await view(workspace, meta, (await writeArchived(workspace, id, archived)).archivedArtifacts);
      events.emit({ type: 'artifact.archived', workspace, artifact });
      return artifact;
    },
  };
}
