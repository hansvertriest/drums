# drums

Run several Claude Code agents in parallel, steer them through living artifacts, and review their code on a live dyffle map.

- [`docs/spec.md`](docs/spec.md): what drums is and how to build it. Read it fully before writing code; modularity is the first requirement.
- [`docs/mockup.html`](docs/mockup.html): the clickable mockup of the interface. Open it in a browser. It still says "dyffle conduct" and "acme"; both mean drums now.
- dyffle-side changes drums depends on: [`../dyff/docs/plans/drums-support.md`](../dyff/docs/plans/drums-support.md).

## Running it

```sh
npm install
npm run build
npm run drums            # starts on 127.0.0.1:4180 and opens the browser
npm run drums -- --port 5000 --no-open
```

`npm test`, `npm run typecheck` and `npm run lint` check the workspace. `npm run lint` also enforces the dependency rules of spec §3; the table is in `tools/eslint/boundaries.js`.

The `drums` command itself lands in `node_modules/.bin` only if `packages/cli/dist` exists during an install, so on a fresh clone run `npm install` once more after the first build to use `npx drums`.

## The dyffle link

dyffle comes from `npm link dyffle` (the global link points at `../dyff`), not from the registry. It is deliberately not listed in any `package.json`, because npm would then replace the link with the published package.

npm removes the link on any install that changes the tree, including `npm install <pkg>`, which runs no root scripts. So `scripts/link-dyffle.mjs` puts it back: as `postinstall`, and before `build`, `typecheck`, `test` and `drums`. To restore it by hand, run `npm run link:dyffle`. Only `packages/server/src/adapters/dyffle` may import it.
