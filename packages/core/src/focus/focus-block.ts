import type { Artifact, Focus } from '@drums/protocol';
import { NotFoundError } from '../errors.js';
import { escapeXml } from '../text/escape-xml.js';

type NameOf = (agent: string) => string;

/** Turns a Focus into the block sent in front of the user's text (spec §4.2). Refuses a version that doesn't exist. */
export function focusBlock(focus: Focus, artifact: Artifact, nameOf: NameOf): string {
  const viewing = artifact.versions.find((v) => v.version === focus.version);
  const latest = artifact.versions.at(-1);
  if (!viewing || !latest) throw new NotFoundError(`Artifact ${focus.artifact} has no version ${focus.version}.`);
  const where =
    viewing === latest
      ? `latest, by ${nameOf(viewing.by)}`
      : `by ${nameOf(viewing.by)}; the latest is v${latest.version}, by ${nameOf(latest.by)}`;
  return [
    '<drums-focus>',
    `  artifact: ${artifact.id} "${escapeXml(artifact.title)}", viewing v${viewing.version} (${escapeXml(where)})`,
    '</drums-focus>',
  ].join('\n');
}
