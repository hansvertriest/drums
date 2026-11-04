import type { AgentId, AnswerSet, Answer, ArtifactId, VersionNumber, WorkspaceId } from '@drums/protocol';
import type { ArtifactService } from '../artifacts/artifact-service.js';
import type { AgentService } from '../agents/agent-service.js';
import { ConflictError, InvalidError, NotFoundError } from '../errors.js';
import type { EventBus } from '../events/event-bus.js';
import type { Clock } from '../ports/clock.js';
import type { Store } from '../ports/store.js';
import type { PostService } from '../posts/post-service.js';
import { formatFeedback, type FeedbackGroup } from './format.js';

export interface FeedbackService {
  saveAnswers(workspace: WorkspaceId, artifact: ArtifactId, version: VersionNumber, answers: Answer[]): Promise<AnswerSet>;
  /** The latest version's answers per artifact, pending or sent. */
  latestAnswers(workspace: WorkspaceId): Promise<AnswerSet[]>;
  /** What was answered on one version, for showing it again. */
  answersFor(workspace: WorkspaceId, artifact: ArtifactId, version: VersionNumber): Promise<Answer[]>;
  /** Routes pending answers to the agents that posted the latest versions. Delivers nothing if any recipient runs. */
  send(workspace: WorkspaceId, overall?: string): Promise<{ recipients: AgentId[] }>;
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
  agents: () => Pick<AgentService, 'deliver' | 'isBusy'>;
}

const isPending = (set: AnswerSet | undefined): set is AnswerSet =>
  set !== undefined && set.sentAt === undefined && set.answers.length > 0;

export function createFeedbackService(deps: FeedbackServiceDeps): FeedbackService {
  const { store, events, clock, artifacts, posts } = deps;

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
    const groups = new Map<AgentId, FeedbackGroup[]>();
    for (const artifact of await artifacts.list(workspace)) {
      const latest = artifact.versions.at(-1);
      const set = latest && (await store.getAnswers(workspace, artifact.id, latest.version));
      if (!latest || !isPending(set)) continue;
      const group = { artifact: artifact.id, title: artifact.title, version: latest.version, answers: set.answers };
      groups.set(latest.by, [...(groups.get(latest.by) ?? []), group]);
    }
    return groups;
  };

  return {
    async saveAnswers(workspace, id, version, answers) {
      const artifact = await artifacts.get(workspace, id);
      const latest = artifact.versions.at(-1)?.version;
      if (!artifact.versions.some((v) => v.version === version)) throw new NotFoundError(`Artifact ${id} has no version ${version}.`);
      if (version !== latest) throw new ConflictError(`Version ${version} is read-only: version ${latest} is the latest.`);
      const set: AnswerSet = { artifact: id, version, answers };
      await save(workspace, set);
      return set;
    },
    latestAnswers,
    answersFor: async (workspace, artifact, version) => (await store.getAnswers(workspace, artifact, version))?.answers ?? [],
    async send(workspace, overall) {
      const groups = await collect(workspace);
      if (groups.size === 0 && overall) {
        const fallback = (await store.getWorkspace(workspace))?.agents[0]?.id;
        if (fallback) groups.set(fallback, []);
      }
      if (groups.size === 0) throw new InvalidError('Nothing to send.');

      const agents = deps.agents();
      const running = [...groups.keys()].filter((agent) => agents.isBusy(agent));
      if (running.length > 0) throw new ConflictError('An agent this goes to is working. Wait for it to finish, or stop it.');

      const sentAt = clock.now().toISOString();
      let remaining = overall;
      for (const [agent, items] of groups) {
        const message = formatFeedback(items, remaining);
        if (!(await agents.deliver(workspace, agent, message))) throw new ConflictError('The agent could not be reached.');
        await posts.add(workspace, agent, { kind: 'feedback', items, ...(remaining ? { overall: remaining } : {}) });
        remaining = undefined;
        for (const { artifact, version, answers } of items) await save(workspace, { artifact, version, answers, sentAt });
      }
      return { recipients: [...groups.keys()] };
    },
    async carryOver(workspace, artifact, previous, next) {
      const set = await store.getAnswers(workspace, artifact, previous);
      if (isPending(set)) await save(workspace, { ...set, version: next });
    },
  };
}
