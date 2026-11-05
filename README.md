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

State lives in files, per spec §8. These environment variables move it; use them for trial runs, so your real `~/.drums` stays out of it:

| Variable | Default | Meaning |
|---|---|---|
| `DRUMS_HOME` | `~/.drums` | where `config.json` lives |
| `DRUMS_WORKSPACES_ROOT` | `workspacesRoot` in `config.json`, else `<home>/workspaces` | where workspaces live |
| `DRUMS_AGENT_MODEL` | `models.agent` in `config.json`, else the default in `packages/server/src/config.ts` | the agents' model |
| `DRUMS_ROLE_PICKER_MODEL` | `models.rolePicker` in `config.json`, else the same default | the model that picks roles |
| `DRUMS_ALLOWED_HOSTS` | none | comma-separated hostnames, without port, that a proxy such as `tailscale serve` reaches the server by; they get the API and map, and `X-Forwarded-Proto` is believed for them only |
| `ANTHROPIC_API_KEY` | none | with a key, roles are picked over the Anthropic API; without one, on the machine's Claude Code login |

To attach repos to workspaces, list them in `config.json`: `{ "projects": ["/path/to/repo"] }`. A repo's folder name is what you see. Workspaces get a worktree of each repo, and base indexes are shared in `<home>/dyffle-base`. `gh` on `PATH` opens the PRs, with its own login.

Agents use the machine's existing Claude Code login. The server binds to `127.0.0.1`; there is no auth.

`npm test`, `npm run typecheck` and `npm run lint` check the workspace. `npm run lint` also enforces the dependency rules of spec §3; the table is in `tools/eslint/boundaries.js`.

The `drums` command itself lands in `node_modules/.bin` only if `packages/cli/dist` exists during an install, so on a fresh clone run `npm install` once more after the first build to use `npx drums`.

## The dyffle link

dyffle comes from `npm link dyffle` (the global link points at `../dyff`), not from the registry. It is deliberately not listed in any `package.json`, because npm would then replace the link with the published package.

npm removes the link on any install that changes the tree, including `npm install <pkg>`, which runs no root scripts. So `scripts/link-dyffle.mjs` puts it back: as `postinstall`, and before `build`, `typecheck`, `test` and `drums`. To restore it by hand, run `npm run link:dyffle`. Only `packages/server/src/adapters/dyffle` may import it.
