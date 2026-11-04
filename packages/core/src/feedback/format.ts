import type { Answer, VersionNumber } from '@drums/protocol';

export interface FeedbackGroup {
  artifact: string;
  title: string;
  version: VersionNumber;
  answers: Answer[];
}

/** Answers come from an iframe running agent-written code, so nothing in them may close a tag. */
const escapeXml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const overallLine = (overall: string | undefined) => (overall ? [`  <overall>${escapeXml(overall)}</overall>`] : []);

/** The one message a recipient gets (spec §5.2). The overall note goes in the first block. */
export function formatFeedback(groups: FeedbackGroup[], overall?: string): string {
  if (groups.length === 0) return ['<drums-feedback>', ...overallLine(overall), '</drums-feedback>'].join('\n');
  return groups
    .map((group, index) =>
      [
        `<drums-feedback artifact="${escapeXml(group.artifact)}" title="${escapeXml(group.title)}" version="${group.version}">`,
        ...group.answers.map(
          ({ name, label, value }) =>
            `  <answer name="${escapeXml(name)}" label="${escapeXml(label)}">${escapeXml(value)}</answer>`,
        ),
        ...overallLine(index === 0 ? overall : undefined),
        '</drums-feedback>',
      ].join('\n'),
    )
    .join('\n');
}
