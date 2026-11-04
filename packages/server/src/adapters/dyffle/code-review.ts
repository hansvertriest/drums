import { z } from 'zod';
import type { CodeReview, CodeReviewEventType } from '@drums/core';
import { LiveSession } from 'dyffle';

const EventType = z.enum(['live', 'feed', 'status', 'review']) satisfies z.ZodType<CodeReviewEventType>;

/** One `LiveSession` per worktree (spec §7). The only place that imports dyffle. */
export function createDyffleCodeReview(): CodeReview {
  return {
    async open(worktree, baseRef) {
      const session = new LiveSession({ root: worktree, baseRef });
      await session.start();
      return {
        subscribe(listener) {
          return session.subscribe((event) => {
            const parsed = EventType.safeParse(event);
            if (parsed.success) listener(parsed.data);
          });
        },
        stop: () => session.stop(),
      };
    },
  };
}
