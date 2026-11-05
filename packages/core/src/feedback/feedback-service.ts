import type { AgentId, AnswerSet, Answer, ArtifactId, VersionNumber, WorkspaceId } from '@drums/protocol';
import type { ArtifactService } from '../artifacts/artifact-service.js';
import type { AgentService } from '../agents/agent-service.js';
import type { CodeService } from '../code/code-service.js';
import { ConflictError, InvalidError, NotFoundError } from '../errors.js';
import type { EventBus } from '../events/event-bus.js';
import type { Clock } from '../ports/clock.js';
import type { Store } from '../ports/store.js';
import type { PostService } from '../posts/post-service.js';
import type { RoleRegistry } from '../roles/registry.js';
import { formatFeedback, type CodeFeedback, type FeedbackGroup } from './format.js';

export interface FeedbackService {
  saveAnswers(workspace: WorkspaceId, artifact: ArtifactId, version: VersionNumber, answers: Answer[]): Promise<AnswerSet>;
  /** The latest version's answers per artifact, pending or sent. */
  latestAnswers(workspace: WorkspaceId): Promise<AnswerSet[]>;
  /** What was answered on one version, for showing it again. */
  answersFor(workspace: WorkspaceId, artifact: ArtifactId, version: VersionNumber): Promise<Answer[]>;
  /**
   * Routes pending answers to the agents that posted the latest versions, and code comments to
   * the agent that posted the last checkpoint, or else the first that works on repos. The overall
   * note goes to the first of them. With nothing else the note goes to `to`, or else the first
   * agent. Delivers nothing if any recipient runs.
   */
  send(workspace: WorkspaceId, input?: { overall?: string | undefined; to?: AgentId | undefined }): Promise<{ recipients: AgentId[] }>;
  /** Who code comments go to right now (spec §5.2). */
  codeRecipient(workspace: WorkspaceId): Promise<AgentId | undefined>;
  /** Unsent answers follow the artifact to its new version; the bridge drops those whose control is gone. */
  carryOver(workspace: WorkspaceId, artifact: ArtifactId, previous: VersionNumber, next: VersionNumber): Promise<void>;
}

export interface FeedbackServiceDeps {
  store: Store;
  events: EventBus;
  clock: Clock;
  artifacts: ArtifactService;
  posts: PostService;
  /** Supplied lazily: artifacts call `carryOver`, and agents hold artifacts. */
  agents: () => Pick<AgentService, 'reserve' | 'deliver' | 'release'>;
  code: () => Pick<CodeService, 'pendingReviews' | 'markDelivered'>;
  roles: RoleRegistry;
}

interface Delivery {
  items: FeedbackGroup[];
  code: Array<CodeFeedback & { marks: string[] }>;
}

const isPending = (set: AnswerSet | undefined): set is AnswerSet =>
  set !== undefined && set.sentAt === undefined && set.answers.length > 0;

export function createFeedbackService(deps: FeedbackServiceDeps): FeedbackService {
  const { store, events, clock, artifacts, posts, roles } = deps;

  const save = async (workspace: WorkspaceId, set: AnswerSet) => {
    await store.saveAnswers(workspace, set);
    events.emit({ type: 'answers.changed', workspace, artifact: set.artifact, set });
  };

  const latestAnswers: FeedbackService['latestAnswers'] = async (workspace) => {
    const sets = await Promise.all(
      (await artifacts.list(workspace)).map(async (artifact) => {
        const latest = artifact.versions.at(-1);
        return latest && store.getAnswers(workspace, artifact.id, latest.version);
      }),
    );
    return sets.filter((set) => set !== undefined);
  };

  /** Pending groups per recipient, in artifact order. */
  const collect = async (workspace: WorkspaceId) => {
    const groups = new Map<AgentId, Delivery>();
    for (const artifact of await artifacts.list(workspace)) {
      const latest = artifact.versions.at(-1);
      const set = latest && (await store.getAnswers(workspace, artifact.id, latest.version));
      if (!latest || !isPending(set)) continue;
      const group = { artifact: artifact.id, title: artifact.title, version: latest.version, answers: set.answers };
      const delivery = groups.get(latest.by) ?? { items: [], code: [] };
      delivery.items.push(group);
      groups.set(latest.by, delivery);
    }
    return groups;
  };

  /** Spec §5.2: whoever posted the last checkpoint, or else the agent whose role works on repos. */
  const codeRecipient = async (workspace: WorkspaceId): Promise<AgentId | undefined> => {
    const lastCheckpoint = (await posts.list(workspace)).filter((post) => post.kind === 'checkpoint').at(-1);
    if (lastCheckpoint) return lastCheckpoint.agent;
    const members = (await store.getWorkspace(workspace))?.agents ?? [];
    return (members.find((agent) => roles.get(agent.role).needsRepo) ?? members[0])?.id;
  };

  const collectCode = async (workspace: WorkspaceId, groups: Map<AgentId, Delivery>) => {
    const reviews = await deps.code().pendingReviews(workspace);
    const recipient = reviews.length > 0 ? await codeRecipient(workspace) : undefined;
    if (!recipient) return;
    const delivery = groups.get(recipient) ?? { items: [], code: [] };
    delivery.code.push(...reviews);
    groups.set(recipient, delivery);
  };

  return {
    saveAnswers: (workspace, id, version, answers) =>
      // In turn with new versions: answers saved on one that was just replaced would miss `carryOver`.
      artifacts.exclusive(workspace, async () => {
        const artifact = await artifacts.get(workspace, id);
        const latest = artifact.versions.at(-1)?.version;
        if (!artifact.versions.some((v) => v.version === version)) throw new NotFoundError(`Artifact ${id} has no version ${version}.`);
        if (version !== latest) throw new ConflictError(`Version ${version} is read-only: version ${latest} is the latest.`);
        const set: AnswerSet = { artifact: id, version, answers };
        await save(workspace, set);
        return set;
      }),
    latestAnswers,
    codeRecipient,
    answersFor: async (workspace, artifact, version) => (await store.getAnswers(workspace, artifact, version))?.answers ?? [],
    send: (workspace, { overall, to } = {}) =>
      // In turn with new versions: the author must still be the latest when the answers go, and
      // a version posted meanwhile must not carry over answers that are just being sent.
      artifacts.exclusive(workspace, async () => {
        const groups = await collect(workspace);
        await collectCode(workspace, groups);
        if (groups.size === 0 && overall) {
          const fallback = to ?? (await store.getWorkspace(workspace))?.agents.find((agent) => !agent.closed)?.id;
          if (fallback) groups.set(fallback, { items: [], code: [] });
        }
        if (groups.size === 0) throw new InvalidError('Nothing to send.');

        const agents = deps.agents();
        const recipients = [...groups.keys()];
        await agents.reserve(workspace, recipients);

        const sentAt = clock.now().toISOString();
        const reserved = new Set(recipients);
        let remaining = overall;
        try {
          for (const [agent, { items, code }] of groups) {
            reserved.delete(agent);
            const message = formatFeedback(items, remaining, code);
            if (!(await agents.deliver(workspace, agent, message))) throw new ConflictError('The agent could not be reached.');
            await posts.add(workspace, agent, {
              kind: 'feedback',
              items,
              ...(remaining ? { overall: remaining } : {}),
              ...(code.length > 0 ? { code: code.map(({ repo, comments, markdown }) => ({ repo, comments, markdown })) } : {}),
            });
            remaining = undefined;
            for (const { artifact, version, answers } of items) await save(workspace, { artifact, version, answers, sentAt });
            for (const { repo, marks } of code) {
              await deps.code().markDelivered(workspace, repo, marks);
              events.emit({ type: 'map.changed', workspace, repo, aspect: 'review' });
            }
          }
        } finally {
          agents.release([...reserved]);
        }
        return { recipients };
      }),
    async carryOver(workspace, artifact, previous, next) {
      const set = await store.getAnswers(workspace, artifact, previous);
      if (isPending(set)) await save(workspace, { ...set, version: next });
    },
  };
}
