import { z } from 'zod';
import { AgentId, ArtifactId, ArtifactKindId, VersionNumber } from './ids.js';

/** `meta.json`: what is true of an artifact whatever its versions. */
export const ArtifactMeta = z.object({
  id: ArtifactId,
  title: z.string().min(1),
  kind: ArtifactKindId,
  createdAt: z.iso.datetime(),
  /** Put away by the user: out of the tabs and the overview, until it is restored or gets a new version. */
  archived: z.boolean().optional(),
});
export type ArtifactMeta = z.infer<typeof ArtifactMeta>;

/** `v3.json`: an immutable snapshot's author, note and time. */
export const ArtifactVersion = z.object({
  version: VersionNumber,
  by: AgentId,
  note: z.string(),
  at: z.iso.datetime(),
});
export type ArtifactVersion = z.infer<typeof ArtifactVersion>;

export const Artifact = ArtifactMeta.extend({
  /** Which frontend renderer shows it; named by the artifact kind. */
  renderer: z.string().min(1),
  versions: z.array(ArtifactVersion),
});
export type Artifact = z.infer<typeof Artifact>;

/** A value the user set in an artifact's controls. Limits: this text comes from an iframe. */
export const Answer = z.object({
  name: z.string().min(1).max(200),
  label: z.string().max(500),
  value: z.string().max(20_000),
});
export type Answer = z.infer<typeof Answer>;

export const Answers = z.array(Answer).max(500);

/** `answers/<id>-v3.json`. Pending until `sentAt` is set; kept after that so old versions still show them. */
export const AnswerSet = z.object({
  artifact: ArtifactId,
  version: VersionNumber,
  answers: Answers,
  sentAt: z.iso.datetime().optional(),
});
export type AnswerSet = z.infer<typeof AnswerSet>;
