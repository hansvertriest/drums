import type { RolePicker } from '@drums/core';
import { createApiCall, type CreateMessage } from './role-pick-api.js';
import { createLoginCall, type RunOneShot } from './role-pick-login.js';
import { parsePicks, pickCall } from './role-pick-prompt.js';

/** A workspace's creation waits for this, and then starts a fallback. */
const DEFAULT_TIMEOUT_MS = 30_000;

export interface ClaudeRolePickerOptions {
  /** From config, never from code. */
  model: string;
  /** With a key, the Anthropic API. Without one, the machine's Claude Code login. */
  apiKey?: string | undefined;
  timeoutMs?: number;
  /** The SDKs' calls; tests replace them so they never reach the model. */
  createMessage?: CreateMessage;
  runQuery?: RunOneShot;
}

/** `RolePicker` with one model call and structured output, either way (spec §4.4). */
export function createClaudeRolePicker({ model, apiKey, timeoutMs = DEFAULT_TIMEOUT_MS, createMessage, runQuery }: ClaudeRolePickerOptions): RolePicker {
  const call = apiKey ? createApiCall({ model, apiKey, createMessage }) : createLoginCall({ model, runQuery });

  return {
    async pick(request) {
      const aborted = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const late = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          aborted.abort();
          reject(new Error(`No answer in ${timeoutMs} ms.`));
        }, timeoutMs);
      });
      try {
        // A race as well as the abort: nothing a call does can keep the caller waiting past the limit.
        const answer = parsePicks(await Promise.race([call(pickCall(request), aborted.signal), late]));
        return request.exactlyOne ? { picks: answer.picks.slice(0, 1) } : answer;
      } catch (error) {
        console.error(`drums: picking roles failed: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
      } finally {
        clearTimeout(timer);
        aborted.abort();
      }
    },
  };
}
