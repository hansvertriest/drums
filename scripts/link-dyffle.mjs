// dyffle is not on the registry for us: it comes from `npm link dyffle` (the global
// link points at ../dyff). `npm install` prunes such a link because no package.json
// lists it, so this restores it after every install.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

if (!existsSync(new URL('../node_modules/dyffle/package.json', import.meta.url))) {
  const { status } = spawnSync('npm', ['link', 'dyffle', '--no-save', '--ignore-scripts'], {
    cwd: new URL('..', import.meta.url),
    stdio: 'inherit',
  });
  if (status !== 0) {
    console.error('drums: could not link dyffle. Run `npm link` in ../dyff, then `npm link dyffle` here.');
    process.exitCode = 1;
  }
}
