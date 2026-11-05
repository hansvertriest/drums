import { randomUUID } from 'node:crypto';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import type { CanUseTool, PermissionMode, PermissionResult } from '@anthropic-ai/claude-agent-sdk';
import type { AgentEvent } from '@drums/core';
import type { PermissionDecision } from '@drums/protocol';
import { realLocation } from './file-writes.js';
import { summarize } from './messages.js';

const DETAIL_LENGTH = 2000;
const EDIT_TOOLS = ['Edit', 'Write', 'NotebookEdit'];
/** Git's, Claude's, dyffle's and drums' own files are no edit to approve without asking. */
const GUARDED_FOLDERS = ['.git', '.claude', '.dyffle', '.drums'];

/** A file edit inside the workspace folder, following links, and not in a guarded folder. */
export function isWorkspaceEdit(cwd: string, tool: string, input: Record<string, unknown>): boolean {
  if (!EDIT_TOOLS.includes(tool)) return false;
  const path = input.file_path ?? input.notebook_path;
  if (typeof path !== 'string') return false;
  const inside = relative(realLocation(cwd), realLocation(resolve(cwd, path)));
  if (inside === '' || inside.startsWith('..') || isAbsolute(inside)) return false;
  return !inside.split(sep).some((part) => GUARDED_FOLDERS.includes(part));
}

export interface PermissionGate {
  canUseTool: CanUseTool;
  /** The mode the session reports it runs in. Asked for `auto`, a session without it starts in `default`. */
  observeMode(mode: PermissionMode): AgentEvent[];
  respond(id: string, decision: PermissionDecision): boolean;
  /** Denies everything that is waiting, so `interrupt` and `close` don't hang on an answer. */
  denyAll(message: string): void;
}

/**
 * Where a call lands that the SDK won't decide on its own. In `auto` mode that is every call that
 * gets here: the user decides. Without `auto` the fallback applies: edits inside the workspace folder
 * pass, and the user decides the rest.
 */
export function createPermissionGate(cwd: string, emit: (event: AgentEvent) => void): PermissionGate {
  const waiting = new Map<string, (result: PermissionResult) => void>();
  let classifier = false;
  let reported: string | undefined;

  return {
    canUseTool(tool, input, { signal, title, toolUseID }) {
      if (!classifier && isWorkspaceEdit(cwd, tool, input)) {
        return Promise.resolve({ behavior: 'allow', updatedInput: input, toolUseID });
      }
      const id = randomUUID();
      const detail = summarize(input, DETAIL_LENGTH);
      return new Promise((resolve) => {
        const settle = (result: PermissionResult) => {
          waiting.delete(id);
          signal.removeEventListener('abort', cancelled);
          resolve(result);
        };
        const cancelled = () => {
          emit({ type: 'permission.cancelled', id });
          settle({ behavior: 'deny', message: 'The turn was cancelled.', toolUseID });
        };
        waiting.set(id, (result) => settle(result.behavior === 'allow' ? { ...result, updatedInput: input, toolUseID } : { ...result, toolUseID }));
        signal.addEventListener('abort', cancelled, { once: true });
        emit({ type: 'permission.requested', id, tool, title: title ?? `Use ${tool}`, detail });
      });
    },
    observeMode(mode) {
      classifier = mode === 'auto';
      const summary = classifier ? 'auto mode: a classifier decides, the rest asks you' : `no auto mode (${mode}): edits in the workspace folder pass, the rest asks you`;
      if (summary === reported) return [];
      reported = summary;
      return [{ type: 'step', tool: 'permissions', summary }];
    },
    respond(id, decision) {
      const answer = waiting.get(id);
      if (!answer) return false;
      answer(decision === 'allow' ? { behavior: 'allow' } : { behavior: 'deny', message: 'The user denied this call.' });
      return true;
    },
    denyAll(message) {
      for (const answer of [...waiting.values()]) answer({ behavior: 'deny', message, interrupt: true });
    },
  };
}
