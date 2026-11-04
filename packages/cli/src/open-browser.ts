import { spawn } from 'node:child_process';

function opener(url: string, platform: NodeJS.Platform): [string, string[]] {
  if (platform === 'darwin') return ['open', [url]];
  if (platform === 'win32') return ['cmd', ['/c', 'start', '', url]];
  return ['xdg-open', [url]];
}

/** Best effort: the server's URL is printed anyway. */
export function openBrowser(url: string, platform: NodeJS.Platform = process.platform): void {
  const [command, args] = opener(url, platform);
  const child = spawn(command, args, { stdio: 'ignore', detached: true });
  child.on('error', () => {});
  child.unref();
}
