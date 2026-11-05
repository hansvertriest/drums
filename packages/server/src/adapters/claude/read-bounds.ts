import type { HookCallback } from '@anthropic-ai/claude-agent-sdk';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { realLocation } from './file-writes.js';

/** What `read-files` means in the SDK's terms. */
export const READ_TOOLS = ['Read', 'Glob', 'Grep'];

const CLOSED_FOLDERS = ['.git', '.drums', '.dyffle'];
/** The same names for a recursive Grep, as ripgrep globs: without a slash they match at any depth. */
const CLOSED_GLOBS = [...CLOSED_FOLDERS, '.env', '.env.*', '*.pem', '*.key'].map((glob) => `!${glob}`);

/** Lower case, because on a Mac `.GIT/config` and `.ENV` are the same files. */
function isClosedName(part: string): boolean {
  const name = part.toLowerCase();
  return CLOSED_FOLDERS.includes(name) || name === '.env' || name.startsWith('.env.') || name.endsWith('.pem') || name.endsWith('.key');
}

/** Why this path can't be read, following links and `..`. A relative path starts at `from`, which is the working directory unless given. */
function refusedPath(cwd: string, path: string, from = cwd): string | undefined {
  // The tools expand `~` themselves, where `resolve` would take it for a folder here.
  if (path.startsWith('~')) return `${path} is outside the workspace folder.`;
  const asked = resolve(from, path);
  const inside = relative(realLocation(cwd), realLocation(asked));
  if (inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside)) return `${path} is outside the workspace folder.`;
  // The name as asked counts too: a link called `.env` is closed wherever it points.
  const names = [...inside.split(sep), ...relative(cwd, asked).split(sep)];
  return names.some(isClosedName) ? `${path} is closed: secrets, .git, .drums and .dyffle aren't readable.` : undefined;
}

/** A Glob pattern can walk out by itself: `/etc/*`, `../*`, `{a,/etc}/*`, or through a link in its literal start. */
function refusedPattern(cwd: string, base: string, pattern: string): string | undefined {
  if (pattern.split(/[/\\{},]/).includes('..') || /^~|[{,]\s*[/~]/.test(pattern)) return `The pattern ${pattern} leaves the workspace folder.`;
  const parts = pattern.split('/');
  const wild = parts.findIndex((part) => /[*?[\]{}()!]/.test(part));
  const literal = (wild < 0 ? parts : parts.slice(0, wild)).join('/');
  return refusedPath(cwd, literal || (pattern.startsWith('/') ? '/' : '.'), base);
}

/**
 * Why a read tool's call is refused, if it is. Input fields as in the SDK's `sdk-tools.d.ts`: Read has
 * `file_path`, Glob `pattern` and `path?`, Grep `path?`. Without a `path`, Glob and Grep search the working directory.
 */
export function refusedRead(cwd: string, tool: string, input: Record<string, unknown>): string | undefined {
  if (tool === 'Read') return typeof input.file_path === 'string' ? refusedPath(cwd, input.file_path) : 'Read needs a file_path.';
  const path = input.path ?? '.';
  if (typeof path !== 'string') return `${tool} needs its path as text.`;
  const refused = refusedPath(cwd, path);
  if (refused || tool !== 'Glob') return refused;
  return typeof input.pattern === 'string' ? refusedPattern(cwd, resolve(cwd, path), input.pattern) : 'Glob needs a pattern.';
}

/** A recursive Grep prints file contents, so the closed names go out of its search. Later globs win, so these go last. */
export function grepWithoutClosedFiles(input: Record<string, unknown>): Record<string, unknown> {
  const own = typeof input.glob === 'string' && input.glob.trim() ? [input.glob] : [];
  return { ...input, glob: [...own, ...CLOSED_GLOBS].join(' ') };
}

/** Bounds `READ_TOOLS` to the workspace folder. Pre-approving them would otherwise open every file on the machine. */
export function boundReads(cwd: string): HookCallback {
  return async (input) => {
    if (input.hook_event_name !== 'PreToolUse' || !READ_TOOLS.includes(input.tool_name)) return {};
    const toolInput = input.tool_input as Record<string, unknown>;
    const reason = refusedRead(cwd, input.tool_name, toolInput);
    if (reason) return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } };
    return input.tool_name === 'Grep' ? { hookSpecificOutput: { hookEventName: 'PreToolUse', updatedInput: grepWithoutClosedFiles(toolInput) } } : {};
  };
}
