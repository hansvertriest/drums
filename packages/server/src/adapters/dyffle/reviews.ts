import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PendingReview } from '@drums/core';
import { reviewsMarkdown, type Review } from 'dyffle';

const NOTHING: PendingReview = { markdown: '', comments: 0, marks: [] };

const hash = (...parts: string[]) => createHash('sha256').update(parts.join('\0')).digest('hex').slice(0, 24);

/** The mark of a comment or an overall comment: a changed text counts as new. */
const commentMark = (key: string, id: string, body: string) => hash(key, id, body);
const overallMark = (key: string, body: string) => hash(key, 'overall', body);

function readReviews(dir: string): Review[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names.filter((name) => name.endsWith('.json')).map((name) => JSON.parse(readFileSync(join(dir, name), 'utf8')) as Review);
}

/**
 * `reviewsMarkdown` prints everything in a root's `.dyffle/reviews`, and there is no way to ask for
 * part of it. So it runs on a stand-in root: the worktree's entries as links, for its check on
 * whether a comment is outdated, and a `.dyffle` holding only what wasn't delivered yet.
 */
function markdownOf(worktree: string, reviews: readonly Review[]): string {
  const root = mkdtempSync(join(tmpdir(), 'drums-review-'));
  try {
    for (const name of readdirSync(worktree)) {
      if (name !== '.dyffle') symlinkSync(join(worktree, name), join(root, name));
    }
    const dir = join(root, '.dyffle', 'reviews');
    mkdirSync(dir, { recursive: true });
    for (const review of reviews) writeFileSync(join(dir, `${review.key}.json`), JSON.stringify(review));
    return reviewsMarkdown(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** Comments Send hasn't delivered yet, and an overall comment if that changed. The review files stay as they are. */
export async function pendingReview(worktree: string, delivered: readonly string[]): Promise<PendingReview> {
  const done = new Set(delivered);
  const marks: string[] = [];
  let comments = 0;
  const pending = readReviews(join(worktree, '.dyffle', 'reviews')).flatMap((review) => {
    const left = review.comments.filter((comment) => !done.has(commentMark(review.key, comment.id, comment.body)));
    const overall = review.body.trim();
    const overallPending = overall.length > 0 && !done.has(overallMark(review.key, overall));
    if (left.length === 0 && !overallPending) return [];
    marks.push(...left.map((comment) => commentMark(review.key, comment.id, comment.body)));
    comments += left.length;
    if (overallPending) marks.push(overallMark(review.key, overall));
    return [{ ...review, comments: left, body: overallPending ? review.body : '' }];
  });
  return pending.length === 0 ? NOTHING : { markdown: markdownOf(worktree, pending), comments, marks };
}
