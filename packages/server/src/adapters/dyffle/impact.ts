import type { ImpactResult } from '@drums/core';
import { query, queryMarkdown, type Index } from 'dyffle';

/** `query` throws on a target nothing matches, or on a summary of an index without checks: an answer for the agent, not a crash. */
export function impactOf(index: Index, target?: string): ImpactResult {
  try {
    const result = query(index, target);
    return { status: 'candidates' in result ? 'ambiguous' : 'found', markdown: queryMarkdown(result) };
  } catch (error) {
    return { status: 'not-found', message: error instanceof Error ? error.message : String(error) };
  }
}
