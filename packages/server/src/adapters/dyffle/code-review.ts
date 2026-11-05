import { InvalidError, type CodeReview, type CodeReviewEventType, type CodeReviewSession } from '@drums/core';
import { embedSection, LiveSession, markdownReport, type Index } from 'dyffle';
import { z } from 'zod';
import { impactOf } from './impact.js';
import { pendingReview } from './reviews.js';
import { viewerHtml } from './viewer.js';

const EventType = z.enum(['live', 'feed', 'status', 'review']) satisfies z.ZodType<CodeReviewEventType>;

export interface DyffleOptions {
  /** One folder for all sessions' base indexes, so worktrees of one commit share theirs. */
  baseCacheDir: string;
}

/**
 * Dyffle's listeners must not throw: during `feed`, `post()` would reject though the post is
 * stored, and a retry would duplicate it. A listener's failure stays here.
 */
const guarded =
  <A extends unknown[]>(listener: (...args: A) => void) =>
  (...args: A) => {
    try {
      listener(...args);
    } catch (error) {
      console.error('drums: a dyffle listener failed', error);
    }
  };

function createSession(session: LiveSession): CodeReviewSession {
  /** The live index, up to date with the working tree. The loop would get there within a second; agents ask right after an edit. */
  const current = async (): Promise<Index | undefined> => {
    await session.tick().catch((error: unknown) => console.error('drums: dyffle could not rebuild', error));
    const json = session.index(0);
    return json === undefined ? undefined : (JSON.parse(json) as Index);
  };

  return {
    map: {
      labels: () => session.labels(),
      index: (i) => session.index(i),
      feed: () => session.feed(),
      source: (key, path) => session.source(key, path),
      review: (key) => session.review(key),
      saveReview(key, json, client) {
        try {
          session.saveReview(key, json, client);
        } catch (error) {
          throw new InvalidError(error instanceof Error ? error.message : String(error));
        }
      },
      subscribe: (send) => session.subscribe(guarded(send)),
    },
    subscribe: (listener) =>
      session.subscribe(
        guarded((event: string) => {
          const parsed = EventType.safeParse(event);
          if (parsed.success) listener(parsed.data);
        }),
      ),
    async checkpoint({ title, message, author }) {
      const post = await session.post({ title, message, author, change: true });
      return { post: post.id, ...(post.stats ? { stats: post.stats } : {}) };
    },
    async impact(target) {
      const index = await current();
      return index ? impactOf(index, target) : { status: 'not-found', message: 'The branch has not been indexed yet.' };
    },
    async withReport(body) {
      const index = await current();
      if (!index) throw new InvalidError('The branch has not been indexed yet.');
      return embedSection(body, markdownReport(index));
    },
    async stop() {
      session.unannounce();
      await session.stop();
    },
  };
}

/** One `LiveSession` per worktree, in this process (spec §7). The only folder that imports dyffle. */
export function createDyffleCodeReview({ baseCacheDir }: DyffleOptions): CodeReview {
  return {
    async open({ worktree, baseRef, viewerUrl }) {
      const session = new LiveSession({ root: worktree, baseRef, baseCacheDir });
      await session.start();
      session.announce(viewerUrl);
      return createSession(session);
    },
    viewerHtml,
    pendingReview,
  };
}
