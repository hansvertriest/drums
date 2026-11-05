import type { Answer, VersionNumber } from '@drums/protocol';
import { escapeXml } from '../text/escape-xml.js';

export interface FeedbackGroup {
  artifact: string;
  title: string;
  version: VersionNumber;
  answers: Answer[];
}

/** Review comments of one repo, as `dyffle comments` prints them. */
export interface CodeFeedback {
  repo: string;
  comments: number;
  markdown: string;
}

const overallLine = (overall: string | undefined) => (overall ? [`  <overall>${escapeXml(overall)}</overall>`] : []);

/** Markdown stays as it is, code included. Only a closing tag could end the block early. */
const safeMarkdown = (markdown: string) => markdown.trim().replace(/<\/(drums-feedback)/gi, '&lt;/$1');

/** The one message a recipient gets (spec §5.2). The overall note goes in the first block. */
export function formatFeedback(groups: FeedbackGroup[], overall?: string, code: readonly CodeFeedback[] = []): string {
  if (groups.length === 0 && code.length === 0) return ['<drums-feedback>', ...overallLine(overall), '</drums-feedback>'].join('\n');
  const answers = groups
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
    );
  const comments = code.map(({ repo, markdown }, index) =>
    [
      `<drums-feedback repo="${escapeXml(repo)}">`,
      safeMarkdown(markdown),
      ...overallLine(groups.length === 0 && index === 0 ? overall : undefined),
      '</drums-feedback>',
    ].join('\n'),
  );
  return [...answers, ...comments].join('\n');
}
