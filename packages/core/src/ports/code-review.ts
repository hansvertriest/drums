/** The subset of dyffle drums uses (spec §7). `core` never sees dyffle's own types. */
/** `views`: a dyffle of the branch, a commit or the uncommitted changes changed. */
export type CodeReviewEventType = 'views' | 'status' | 'review';

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
  /** The dyffles the viewer lists: the whole branch, one per commit, and the uncommitted changes. */
  views(): string;
  source(key: string, path: string): string | undefined;
  review(key: string): string | undefined;
  /** Throws `InvalidError` if the review isn't one. */
  saveReview(key: string, json: string, client?: string): void;
  subscribe(send: (event: string, data: unknown) => void): () => void;
}

export interface CodeReviewSession {
  readonly map: MapSource;
  subscribe(listener: (event: CodeReviewEventType) => void): () => void;
  /** A symbol or file's connections, or a summary of the branch with no target. Never throws on a bad target. */
  impact(target?: string): Promise<ImpactResult>;
  /** `body` with the branch's report in its dyffle section, replacing any earlier one. */
  withReport(body: string): Promise<string>;
  /** A stopped session stays stopped. `open` on the same worktree resumes it: commit dyffles and reviews are kept. */
  stop(): Promise<void>;
}

export interface OpenSessionRequest {
  worktree: string;
  /** The branch it is measured against. */
  baseRef: string;
  /** Where the viewer is, so `dyffle comments` works from an agent's shell. */
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
