import type { AgentId, ImageName, Post, PostDraft, WorkspaceId } from '@drums/protocol';
import { NotFoundError } from '../errors.js';
import { createTurns } from '../concurrency/turns.js';
import type { EventBus } from '../events/event-bus.js';
import type { Clock } from '../ports/clock.js';
import type { Store } from '../ports/store.js';
import { toFeed, type Feed } from './feed.js';

export type WithoutPlace<D> = D extends unknown ? Omit<D, 'agent' | 'at'> : never;

export interface PostService {
  add(workspace: WorkspaceId, agent: AgentId, post: WithoutPlace<PostDraft>): Promise<Post>;
  list(workspace: WorkspaceId): Promise<Post[]>;
  /** What the other agents posted after `since`. */
  feed(workspace: WorkspaceId, reader: AgentId, since?: number): Promise<Feed>;
  image(workspace: WorkspaceId, name: ImageName): Promise<Uint8Array>;
}

export function createPostService({ store, events, clock }: { store: Store; events: EventBus; clock: Clock }): PostService {
  /** One at a time per workspace, so time, place in the feed and order of events all agree. */
  const inTurn = createTurns();
  return {
    add: (workspace, agent, draft) =>
      inTurn(workspace, async () => {
        const at = clock.now().toISOString();
        const post = await store.appendPost(workspace, { ...draft, agent, at } as PostDraft);
        events.emit({ type: 'post.created', workspace, post });
        return post;
      }),
    list: (workspace) => store.listPosts(workspace),
    async feed(workspace, reader, since) {
      const [posts, found] = await Promise.all([store.listPosts(workspace), store.getWorkspace(workspace)]);
      return toFeed(posts, found?.agents ?? [], reader, since);
    },
    async image(workspace, name) {
      const bytes = await store.readImage(workspace, name);
      if (!bytes) throw new NotFoundError(`No image ${name}.`);
      return bytes;
    },
  };
}
