import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { z } from 'zod';
import { readJson, toJson, writeNew } from './files.js';

const FILE = /^(\d+)\.json$/;

const entries = async (dir: string): Promise<number[]> => {
  const names = await readdir(dir).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return [] as string[];
    throw error;
  });
  return names.flatMap((name) => {
    const match = FILE.exec(name);
    return match ? [Number(match[1])] : [];
  });
};

const fileName = (seq: number) => `${String(seq).padStart(4, '0')}.json`;

/** A folder of `0007.json` files. Each entry claims the next free number, even with writers racing. */
export function createSequence<T extends { seq: number }>(dir: () => string, schema: z.ZodType<T>) {
  return {
    async append(draft: Omit<T, 'seq'>): Promise<T> {
      for (let seq = Math.max(0, ...(await entries(dir()))) + 1; ; seq++) {
        const entry = { ...draft, seq } as unknown as T;
        if (await writeNew(join(dir(), fileName(seq)), toJson(entry))) return entry;
      }
    },
    async list(): Promise<T[]> {
      const numbers = (await entries(dir())).sort((a, b) => a - b);
      const read = await Promise.all(numbers.map((seq) => readJson(join(dir(), fileName(seq)), schema)));
      return read.filter((entry) => entry !== undefined);
    },
  };
}
