import { z } from 'zod';
import { ImageName } from './image.js';
import { Answer } from './artifact.js';
import { CheckpointRepo } from './branch-map.js';
import { Focus } from './focus.js';
import { AgentId, ArtifactId, RepoName, VersionNumber } from './ids.js';

const Base = z.object({
  /** Position in the workspace's feed: `posts/0007.json`. */
  seq: z.number().int().positive(),
  /** Whose thread it is in. For a note or a version, also its author. */
  agent: AgentId,
  at: z.iso.datetime(),
});

export const NotePost = Base.extend({
  kind: z.literal('note'),
  title: z.string(),
  message: z.string(),
});

export const VersionPost = Base.extend({
  kind: z.literal('version'),
  title: z.string(),
  message: z.string(),
  artifact: ArtifactId,
  version: VersionNumber,
});

/** A version of the branch map: what changed across the repos it touched. */
export const CheckpointPost = Base.extend({
  kind: z.literal('checkpoint'),
  title: z.string(),
  message: z.string(),
  artifact: ArtifactId,
  version: VersionNumber,
  repos: z.array(CheckpointRepo),
});

/** What the user typed in the composer. */
export const MessagePost = Base.extend({
  kind: z.literal('message'),
  text: z.string(),
  images: z.array(ImageName).optional(),
  /** What the user was looking at, so the thread can still say what "this" meant. */
  focus: Focus.optional(),
});

/** What Send delivered, as the thread shows it. */
export const FeedbackPost = Base.extend({
  kind: z.literal('feedback'),
  items: z.array(
    z.object({
      artifact: ArtifactId,
      title: z.string(),
      version: VersionNumber,
      answers: z.array(Answer),
    }),
  ),
  overall: z.string().optional(),
  /** Review comments on code, as Markdown. */
  code: z.array(z.object({ repo: RepoName, comments: z.number().int().nonnegative(), markdown: z.string() })).optional(),
});

/** One agent passing work to another. Written twice, since a post is in one thread: `sent` for the sender, `received` for the target. */
export const HandoverPost = Base.extend({
  kind: z.literal('handover'),
  direction: z.enum(['sent', 'received']),
  /** The agent on the other side. */
  peer: AgentId,
  instruction: z.string(),
});
export type HandoverPost = z.infer<typeof HandoverPost>;

/** A thread entry. */
export const Post = z.discriminatedUnion('kind', [NotePost, VersionPost, CheckpointPost, MessagePost, FeedbackPost, HandoverPost]);
export type Post = z.infer<typeof Post>;

/** A post before the store gives it its place in the feed. */
export type PostDraft = Post extends infer P ? (P extends Post ? Omit<P, 'seq'> : never) : never;

const StepBase = z.object({
  seq: z.number().int().positive(),
  agent: AgentId,
  at: z.iso.datetime(),
});

/** What an agent did between posts. */
export const Step = z.discriminatedUnion('kind', [
  StepBase.extend({ kind: z.literal('tool'), tool: z.string(), summary: z.string() }),
  StepBase.extend({ kind: z.literal('text'), text: z.string() }),
  StepBase.extend({ kind: z.literal('error'), text: z.string() }),
]);
export type Step = z.infer<typeof Step>;

export type StepDraft = Step extends infer S ? (S extends Step ? Omit<S, 'seq'> : never) : never;
