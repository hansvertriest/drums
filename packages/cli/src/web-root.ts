import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

/** `@drums/web` is only a folder of built files here; its code is never imported. */
export function findWebRoot(): string {
  const manifest = createRequire(import.meta.url).resolve('@drums/web/package.json');
  const webRoot = join(dirname(manifest), 'dist');
  if (!existsSync(join(webRoot, 'index.html'))) {
    throw new Error('The web app is not built. Run `npm run build` first.');
  }
  return webRoot;
}
