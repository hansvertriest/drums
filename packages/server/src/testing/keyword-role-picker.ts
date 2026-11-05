import type { RoleCandidate, RolePick, RolePicker } from '@drums/core';

const IGNORED =
  'about after against also and are but can for from has have into its let make not once our should than that the them then they this those with what when where which who will would you your'.split(
    ' ',
  );

const SUFFIXES = ['ing', 'ers', 'er', 'es', 'ed', 's', 'e'];

/** Good enough to meet `review` in `Reviews`, and `Reviewer`, without a dictionary. */
function stem(word: string): string {
  const suffix = SUFFIXES.find((s) => word.endsWith(s) && word.length - s.length >= 4);
  return suffix ? word.slice(0, -suffix.length) : word;
}

const stems = (text: string) =>
  (text.toLowerCase().match(/[a-z]+/g) ?? [])
    .filter((word) => word.length > 2 && !IGNORED.includes(word))
    .map(stem);

interface Match {
  candidate: RoleCandidate;
  hits: number;
  first: number;
}

function match(words: readonly string[], candidate: RoleCandidate): Match | undefined {
  const summary = new Set(stems(candidate.summary));
  const hits = words.filter((word) => summary.has(word));
  return hits.length > 0 ? { candidate, hits: new Set(hits).size, first: words.findIndex((word) => summary.has(word)) } : undefined;
}

/**
 * Picks by the words a role's `summary` shares with the request: the most words wins, and on
 * a tie the one the request names first. Returns nothing if no word matches, and `core` then
 * falls back. Stands in for the model call in tests; knows no role by name.
 */
export function createKeywordRolePicker(): RolePicker {
  return {
    async pick({ goal, candidates, exactlyOne }) {
      const words = stems(goal);
      const ranked = candidates
        .flatMap((candidate) => match(words, candidate) ?? [])
        .sort((a, b) => b.hits - a.hits || a.first - b.first);
      const picks: RolePick[] = ranked.map(({ candidate }) => ({ role: candidate.id, instruction: goal }));
      return { picks: exactlyOne ? picks.slice(0, 1) : picks };
    },
  };
}
