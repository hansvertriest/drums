import type { AgentId, Post, PostDraft, WorkspaceId } from '@drums/protocol';
import type { EventBus } from '../events/event-bus.js';
import type { Clock } from '../ports/clock.js';
import type { Store } from '../ports/store.js';

type WithoutPlace<D> = D extends unknown ? Omit<D, 'agent' | 'at'> : never;

export interface PostService {
  add(workspace: WorkspaceId, agent: AgentId, post: WithoutPlace<PostDraft>): Promise<Post>;
  list(workspace: WorkspaceId): Promise<Post[]>;
}

export function createPostService({ store, events, clock }: { store: Store; events: EventBus; clock: Clock }): PostService {
  return {
    async add(workspace, agent, draft) {
      const at = clock.now().toISOString();
      const post = await store.appendPost(workspace, { ...draft, agent, at } as PostDraft);
      events.emit({ type: 'post.created', workspace, post });
      return post;
    },
    list: (workspace) => store.listPosts(workspace),
  };
}
