import type { Agent, AgentId, Artifact, WorkspaceId } from '@drums/protocol';
import type { ArtifactService } from '../artifacts/artifact-service.js';
import { NotFoundError } from '../errors.js';
import type { Store } from '../ports/store.js';
import type { PostService } from '../posts/post-service.js';
import type { FeedEntry } from '../posts/feed.js';
import { escapeXml } from '../text/escape-xml.js';

const RECENT_POSTS = 5;
const GOAL_LENGTH = 500;

export interface OverviewData {
  goal: string;
  /** Who reads it. Absent when the agent doesn't exist yet: the role picker gets the overview too. */
  reader?: Agent;
  agents: Agent[];
  artifacts: Artifact[];
  posts: FeedEntry[];
}

const clip = (text: string, length: number) => (text.length > length ? `${text.slice(0, length)}…` : text);

const section = (title: string, lines: string[]) => (lines.length > 0 ? [`  ${title}:`, ...lines.map((line) => `    - ${line}`)] : []);

/** Spec §4.2: pointers, not content. Agents fetch the detail with their tools. Everything here was typed by someone else. */
export function formatOverview({ goal, reader, agents, artifacts, posts }: OverviewData): string {
  const nameOf = (id: AgentId) => escapeXml(agents.find((agent) => agent.id === id)?.name ?? id);
  const others = agents.filter((agent) => agent.id !== reader?.id);
  return [
    '<drums-workspace>',
    `  goal: ${escapeXml(clip(goal, GOAL_LENGTH))}`,
    ...(reader ? [`  you: ${escapeXml(reader.name)}`] : []),
    ...section('other agents', others.map((agent) => `${escapeXml(agent.name)} (${escapeXml(agent.role)}), ${agent.status}`)),
    ...section(
      'artifacts',
      artifacts.flatMap(({ id, title, versions }) => {
        const latest = versions.at(-1);
        return latest ? [`${id} "${escapeXml(title)}", v${latest.version} by ${nameOf(latest.by)}`] : [];
      }),
    ),
    ...section(
      'recent posts',
      posts.map(({ seq, by, title, artifact, version }) => {
        const pointer = artifact ? ` (${artifact} v${version})` : '';
        return `#${seq} ${escapeXml(by)}: "${escapeXml(title)}"${pointer}`;
      }),
    ),
    '</drums-workspace>',
  ].join('\n');
}

export interface OverviewDeps {
  store: Store;
  artifacts: ArtifactService;
  posts: PostService;
}

/** The overview as it stands now, for the agent `reader`, or for the role picker if there is no agent yet. */
export async function workspaceOverview({ store, artifacts, posts }: OverviewDeps, id: WorkspaceId, reader?: AgentId): Promise<string> {
  const workspace = await store.getWorkspace(id);
  if (!workspace) throw new NotFoundError(`No workspace ${id}.`);
  const [artifactViews, feed] = await Promise.all([artifacts.list(id), posts.feed(id, reader ?? '')]);
  const self = workspace.agents.find((agent) => agent.id === reader);
  return formatOverview({
    goal: workspace.goal,
    ...(self ? { reader: self } : {}),
    agents: workspace.agents,
    artifacts: artifactViews,
    posts: feed.posts.slice(-RECENT_POSTS),
  });
}
