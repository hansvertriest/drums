import type { Agent, AgentId, ArtifactId, HandoverPost, Post, VersionNumber } from '@drums/protocol';

/** Posts an agent wrote, as opposed to what the user sent it. */
export type AuthoredPost = Extract<Post, { kind: 'note' | 'version' | 'checkpoint' }> | (HandoverPost & { direction: 'sent' });

/** A handover counts once: the receiving side is the same event, seen from the other thread. */
export const isAuthored = (post: Post): post is AuthoredPost =>
  post.kind === 'note' || post.kind === 'version' || post.kind === 'checkpoint' || (post.kind === 'handover' && post.direction === 'sent');

export interface FeedEntry {
  seq: number;
  by: string;
  role?: string;
  title: string;
  message: string;
  at: string;
  artifact?: ArtifactId;
  version?: VersionNumber;
}

export interface Feed {
  posts: FeedEntry[];
  /** Pass this as `since` next time. */
  cursor: number;
}

const LIMIT = 50;

/** What the other agents posted after `since`, newest last, at most the last `limit`. */
export function toFeed(posts: readonly Post[], members: readonly Agent[], reader: AgentId, since = 0, limit = LIMIT): Feed {
  const entries = posts
    .filter(isAuthored)
    .filter((post) => post.agent !== reader && post.seq > since)
    .slice(-limit)
    .map((post): FeedEntry => {
      const nameOf = (id: AgentId) => members.find((agent) => agent.id === id)?.name ?? id;
      const author = members.find((agent) => agent.id === post.agent);
      return {
        seq: post.seq,
        by: nameOf(post.agent),
        ...(author ? { role: author.role } : {}),
        ...(post.kind === 'handover' ? { title: `Handed over to ${nameOf(post.peer)}`, message: post.instruction } : { title: post.title, message: post.message }),
        at: post.at,
        ...(post.kind === 'version' || post.kind === 'checkpoint' ? { artifact: post.artifact, version: post.version } : {}),
      };
    });
  return { posts: entries, cursor: Math.max(since, ...posts.map((post) => post.seq)) };
}
