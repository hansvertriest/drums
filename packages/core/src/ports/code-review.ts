/**
 * The subset of dyffle drums uses (spec §7). `core` never sees dyffle's own types.
 * Posts, reviews and the map's data join this with M3.
 */
export type CodeReviewEventType = 'live' | 'feed' | 'status' | 'review';

export interface CodeReviewSession {
  subscribe(listener: (event: CodeReviewEventType) => void): () => void;
  stop(): Promise<void>;
}

export interface CodeReview {
  open(worktree: string, baseRef: string): Promise<CodeReviewSession>;
}
