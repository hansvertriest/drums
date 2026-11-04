import { randomUUID } from 'node:crypto';
import { link, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { z } from 'zod';

const isCode = (error: unknown, code: string) => (error as NodeJS.ErrnoException).code === code;

/** Writes beside the target, so a crash never leaves half a file under the real name. */
async function writeTemp(path: string, text: string): Promise<string> {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${randomUUID()}.tmp`;
  await writeFile(temp, text);
  return temp;
}

/** Temp file plus rename: replaces what is there in one step. */
export async function writeAtomic(path: string, text: string): Promise<void> {
  await rename(await writeTemp(path, text), path);
}

/** Temp file plus link: as atomic, and false instead of overwriting. This is what keeps versions immutable. */
export async function writeNew(path: string, text: string): Promise<boolean> {
  const temp = await writeTemp(path, text);
  try {
    await link(temp, path);
    return true;
  } catch (error) {
    if (isCode(error, 'EEXIST')) return false;
    throw error;
  } finally {
    await rm(temp, { force: true });
  }
}

export async function readText(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (isCode(error, 'ENOENT')) return undefined;
    throw error;
  }
}

/** Undefined if the file isn't there. Throws, naming the file, if it isn't what it should be. */
export async function readJson<T>(path: string, schema: z.ZodType<T>): Promise<T | undefined> {
  const text = await readText(path);
  if (text === undefined) return undefined;
  try {
    return schema.parse(JSON.parse(text));
  } catch (error) {
    throw new Error(`${path} is not valid: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export const toJson = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
