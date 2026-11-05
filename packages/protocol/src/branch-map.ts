import { z } from 'zod';
import { RepoName } from './ids.js';

/** What one repo contributed to a checkpoint. */
export const CheckpointRepo = z.object({
  name: RepoName,
  /** The post's number in that repo's dyffle feed. */
  post: z.number().int().positive(),
  files: z.number().int().nonnegative(),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  symbols: z.number().int().nonnegative(),
});
export type CheckpointRepo = z.infer<typeof CheckpointRepo>;

/** The content of one version of the branch map: a checkpoint, and where it is in each repo's feed. */
export const BranchMapVersion = z.object({ repos: z.array(CheckpointRepo).min(1) });
export type BranchMapVersion = z.infer<typeof BranchMapVersion>;
