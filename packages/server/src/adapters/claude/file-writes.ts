import { realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

const EDIT_TOOLS = ['Edit', 'Write', 'NotebookEdit'];

/** Where a shell command writes, as far as its text shows: a redirect, `tee`, or the last argument of `cp` and `mv`. */
const SHELL_TARGET = /(?:>>?|\btee(?:\s+-a)?|\b(?:cp|mv)(?:\s+-\w+)*\s+[^\s;|&]+)\s*(?:"([^"]+)"|'([^']+)'|([^\s"';|&>]+))/g;

/** The real location of a path that may not exist yet: its nearest existing parent, resolved, plus the rest. */
export function realLocation(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    const parent = dirname(path);
    return parent === path ? path : resolve(realLocation(parent), relative(parent, path));
  }
}

/** Relative to the working directory when inside it. Links count, so `/tmp` and `/private/tmp` are one place. */
function fromWorkingDirectory(cwd: string, path: string): string {
  const location = realLocation(resolve(cwd, path));
  const inside = relative(realLocation(cwd), location);
  return inside === '' || inside.startsWith('..') || isAbsolute(inside) ? location : inside;
}

function pathsIn(tool: string, input: Record<string, unknown>): string[] {
  if (EDIT_TOOLS.includes(tool)) {
    const path = input.file_path ?? input.notebook_path;
    return typeof path === 'string' ? [path] : [];
  }
  if (tool !== 'Bash' || typeof input.command !== 'string') return [];
  return [...input.command.matchAll(SHELL_TARGET)].map((match) => (match[1] ?? match[2] ?? match[3]) as string).filter((path) => !path.startsWith('/dev/'));
}

/**
 * The files a tool call writes. Exact for the edit tools. For the shell it reads the command's
 * text, so a script that writes a file goes unseen, and after a `cd` the path may be off.
 */
export function writtenFiles(cwd: string, tool: string, input: unknown): string[] {
  if (typeof input !== 'object' || input === null) return [];
  return pathsIn(tool, input as Record<string, unknown>).map((path) => fromWorkingDirectory(cwd, path));
}
