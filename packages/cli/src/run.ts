import { main } from '@drums/server';
import { parseCliArgs } from './args.js';
import { openBrowser } from './open-browser.js';
import { findWebRoot } from './web-root.js';

const HOST = '127.0.0.1';

export async function run(argv: string[]): Promise<void> {
  const { port, open } = parseCliArgs(argv);
  const drums = await main({ port, host: HOST, webRoot: findWebRoot() });
  console.log(`drums is running at ${drums.url}`);
  if (open) openBrowser(drums.url);

  const shutdown = () => {
    void drums.stop().then(() => process.exit(0));
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
