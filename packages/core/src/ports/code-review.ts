/** The subset of dyffle drums uses (spec §7). `core` never sees dyffle's own types. */
export type CodeReviewEventType = 'live' | 'feed' | 'status' | 'review';

export interface CodeChange {
  /** The post's number in this repo's feed. */
  post: number;
  /** Absent when nothing changed since the previous post with a change. */
  stats?: { files: number; additions: number; deletions: number; symbols: number };
}

export type ImpactResult =
  /** Markdown for the agent: one node, one file, or the branch summary. */
  | { status: 'found'; markdown: string }
  /** The name fits several nodes; the Markdown lists them. */
  | { status: 'ambiguous'; markdown: string }
  | { status: 'not-found'; message: string };

/** Comments Send hasn't delivered: the Markdown `dyffle comments` would print for them. */
export interface PendingReview {
  markdown: string;
  comments: number;
  /** Identify what is in `markdown`. Hand them back as `delivered` to leave it out next time. */
  marks: string[];
}

/** What the map's frame reads and writes, as opaque JSON: the viewer's contract, not drums'. */
export interface MapSource {
  labels(): string[];
  index(i: number): string | undefined;
  feed(): string;
  source(key: string, path: string): string | undefined;
  review(key: string): string | undefined;
  /** Throws `InvalidError` if the review isn't one. */
  saveReview(key: string, json: string, client?: string): void;
  subscribe(send: (event: string, data: unknown) => void): () => void;
}

export interface CodeReviewSession {
  readonly map: MapSource;
  subscribe(listener: (event: CodeReviewEventType) => void): () => void;
  /** A post with a change: everything since the previous one. */
  checkpoint(input: { title: string; message: string; author: string }): Promise<CodeChange>;
  /** A symbol or file's connections, or a summary of the branch with no target. Never throws on a bad target. */
  impact(target?: string): Promise<ImpactResult>;
  /** `body` with the branch's report in its dyffle section, replacing any earlier one. */
  withReport(body: string): Promise<string>;
  /** A stopped session stays stopped. `open` on the same worktree resumes it: posts and snapshots are kept. */
  stop(): Promise<void>;
}

export interface OpenSessionRequest {
  worktree: string;
  /** The branch it is measured against. */
  baseRef: string;
  /** Where the viewer is, so `dyffle post` and `dyffle comments` work from an agent's shell. */
  viewerUrl: string;
}

export interface CodeReview {
  /** Starts a session, or resumes the stopped one of this worktree. Throws if it can't run. */
  open(request: OpenSessionRequest): Promise<CodeReviewSession>;
  /** The viewer page. */
  viewerHtml(): string;
  /** Reads what is stored in the worktree, so it needs no running session. */
  pendingReview(worktree: string, delivered: readonly string[]): Promise<PendingReview>;
}
