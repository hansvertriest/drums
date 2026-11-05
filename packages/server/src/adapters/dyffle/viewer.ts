import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const FONT_LINKS = /<link\b[^>]*fonts\.g[^>]*>\s*/g;

/**
 * Dyffle's viewer page, from the installed package. It keeps nothing outside the frame: its web fonts
 * go, because the frame's policy allows no network, and it falls back on the system's.
 */
export function viewerHtml(): string {
  const root = dirname(createRequire(import.meta.url).resolve('dyffle/package.json'));
  return readFileSync(join(root, 'viewer', 'index.html'), 'utf8').replace(FONT_LINKS, '');
}
