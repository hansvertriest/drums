import type {
  AgentId,
  Artifact,
  ArtifactId,
  ArtifactKindId,
  ArtifactMeta,
  ArtifactVersion,
  VersionNumber,
  WorkspaceId,
} from '@drums/protocol';
import { NotFoundError } from '../errors.js';
import type { EventBus } from '../events/event-bus.js';
import type { Clock } from '../ports/clock.js';
import type { Store } from '../ports/store.js';
import type { PostService } from '../posts/post-service.js';
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
}

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

  const view = async (workspace: WorkspaceId, meta: ArtifactMeta): Promise<Artifact> => ({
    ...meta,
    renderer: kinds.get(meta.kind).renderer,
    versions: await store.listVersions(workspace, meta.id),
  });

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
  ) => {
    const version: ArtifactVersion = { version: number, by: agent, note, at: clock.now().toISOString() };
    if (!(await store.addVersion(workspace, meta.id, version, content))) return false;
    if (number > 1) await deps.onNewVersion?.(workspace, meta.id, number - 1, number);
    await posts.add(workspace, agent, { kind: 'version', title: meta.title, message: note, artifact: meta.id, version: number });
    events.emit({ type: 'artifact.version', workspace, artifact: await view(workspace, meta), version: number });
    return true;
  };

  return {
    async list(workspace) {
      const metas = await store.listArtifacts(workspace);
      return Promise.all(metas.map((meta) => view(workspace, meta)));
    },
    get: async (workspace, id) => view(workspace, await metaOf(workspace, id)),
    read,
    async create(workspace, agent, { title, content, note, kind }) {
      const definition = kinds.get(kind ?? kinds.list()[0]!.id);
      definition.validate(content);
      const meta = await store.createArtifact(workspace, { title, kind: definition.id, createdAt: clock.now().toISOString() });
      await publish(workspace, agent, meta, 1, content, note);
      return { id: meta.id, version: 1 };
    },
    async update(workspace, agent, { id, baseVersion, content, note }) {
      const meta = await metaOf(workspace, id);
      kinds.get(meta.kind).validate(content);
      const latest = await read(workspace, id);
      if (latest.version === baseVersion && (await publish(workspace, agent, meta, baseVersion + 1, content, note))) {
        return { status: 'ok', version: baseVersion + 1 };
      }
      return { status: 'conflict', latest: await read(workspace, id) };
    },
  };
}
