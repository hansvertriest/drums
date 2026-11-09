# drums: spec

> A drummer hitting every drum at once: that's you with a handful of agents running at the same time. drums keeps them in time.

drums is a local web app for running several Claude Code agents in parallel. Each workspace has its own agents, and each agent has a role. You steer them through what they make: living HTML artifacts with their own controls, and, for code, a live dyffle map of the branch.

`docs/mockup.html` is a clickable mockup of the agreed interface. Open it in a browser. It still says "dyffle conduct" and "acme"; both mean drums now. It is the reference for **what the UI does**, not for how to build it: its code is one file and must not be copied as a structure.

This document is for the agents building drums. Read it fully before writing code. **Modularity is the first requirement.** drums is a base that will be extended with new roles, tools, artifact kinds and agent backends, so every one of those must be addable without editing the core.

---

## 1. Concepts

| Term | Meaning |
|---|---|
| **Workspace** | One goal, e.g. "Checkout v2". Has agents, artifacts and a feed. May have repos attached; then it also has one branch name, shared by all its repos. |
| **Agent** | One Claude Code session with a role, inside one workspace. Agents in a workspace are peers and run in parallel. One can pass work to another with a handover (§4.1). |
| **Role** | What an agent is for: Scoper, Researcher, Designer, Coder, Reviewer. Defines its prompt, its tools and its default artifact kind. Roles are a registry; more will be added. |
| **Artifact** | A living document shared by all agents in the workspace, with versions. Most are HTML; the branch map is a special kind. Any agent may post a new version of any artifact. |
| **Version** | An immutable snapshot of an artifact, with its author (an agent), a one-line note of what changed, and a time. |
| **Post** | An entry in an agent's thread: a new artifact version, a code checkpoint, a note (a post without an artifact), or a handover. |
| **Checkpoint** | A version of the branch map: a dyffle post with a change, across all repos the workspace touched. |
| **Answer** | A value the user set in an artifact's controls. Unsent answers are pending. |
| **Feedback** | What **Send** delivers to an agent: the answers for artifacts it authored, line comments on code, and an overall note. |
| **Focus** | What the user is looking at when they send a message: artifact and version, map file, selected diff lines. Sent along with every message so "review this" is unambiguous. |

Agent statuses: `running`, `input` (needs you), `review` (ready for review), `idle`. A workspace shows the state that most needs you: `input`, then `review`, then `running`, then `pr` (PRs open), then `idle`.

---

## 2. What the user sees

The mockup is the source of truth. The decisions behind it:

- **Minimal.** Short labels, no explanatory text in the chrome, no type or kind pickers.
- **Header:** full width, 60px. The logo sits in a 60px cell on the left, above the task strip, so the header line and the strip's edge meet in one corner. Then the workspace title, a short subline (agent count, branch and repos when present), the workspace status, **Open PR(s)** for code, and **Send** (it fills in and shows a count when something is pending).
- **Workspace strip:** a 60px column of icons (initials plus a status dot, and a blue dot for news since you looked). Hovering opens it over the page, without moving anything, to show each workspace's title, status, the role that posted last, and `+/−` line counts for code. **New workspace** is at the bottom.
- **Chat rail:**
  - **Tabs:** one per agent, each with a status dot, plus `+` to add an agent. There is **no merged "All" feed**. Messages go to the agent whose tab is open.
  - **Composer:** a "working" line with **Stop** while that agent runs.
  - **Steps toggle:** shows the agent's raw tool steps.
  - **Collapse:** a « button or `\` collapses the rail into a floating message button at the bottom left. The button gets a dot when an agent posts while it's collapsed.
- **Artifact stage:**
  - **Tabs:** one per artifact, with an amber count of pending answers.
  - **Version picker:** shows author and time for each version. The change note sits next to it, and a **Changes** switch highlights what changed.
  - **Older versions** are read-only, with a "Latest" link.
  - **Branch map** (code): the dyffle map with a repo filter, Live versus checkpoints, a diff sheet with line comments and a **Viewed** switch.
- **New workspace:** goal, optional repos, and a branch field once a repo is picked. **Never ask which agents to start**; drums decides from the goal. No folder paths shown.
- **Add agent:** only "What should it do?". drums picks the role.
- **Phones:** the strip becomes a drawer, and the rail and stage become two tabs.

---

## 3. Architecture

### 3.1 Principles

1. **Dependencies point inward.**
   - `protocol` (types) depends on nothing.
   - `core` (the domain logic) depends only on `protocol`, and does no I/O of its own.
   - Adapters (Claude, file storage, git, dyffle) implement interfaces that `core` defines.
   - `server` wires it all together.
   - `web` depends only on `protocol` and `artifact-kit`.
   - Nothing imports "upward".
2. **Ports and adapters.** Everything with a side effect is behind an interface in `core`:
   - running an agent
   - storing data
   - git
   - code review (dyffle)
   - the role-picking model call
   - the clock and id generation
   
   Tests run `core` against in-memory fakes.
3. **Registries for everything that will grow.** Roles, tools, artifact kinds and HTTP route groups are each a list of small modules registered in one place. Adding one is **one new file plus one line** in its registry; no `switch` statements over role or kind names anywhere else.
4. **One composition root.** `server/src/main.ts` builds the adapters, the registries and the services, and passes them in. No module creates its own dependencies, and there are no module-level singletons.
5. **Events, not calls, across boundaries.** `core` emits typed domain events (`agent.status`, `post.created`, `artifact.version`, `map.changed`…). The HTTP layer streams them to the browser, and nothing in `core` knows the UI exists.
6. **Validate at every edge** with zod: HTTP bodies, tool inputs, files read from disk, model output.
7. **Small files, one concept each.** A file past ~300 lines is a sign it holds two things. Each package exposes its public API from `src/index.ts`; no deep imports between packages.

### 3.2 Packages (npm or pnpm workspaces)

```
drums/
  packages/
    protocol/      types and zod schemas shared by everything
    core/          domain services, interfaces (ports), registries, events. No I/O.
    server/        adapters, HTTP and live stream, composition root
    web/           Vue 3 frontend
    artifact-kit/  artifact stylesheet and color tokens, iframe bridge script
    cli/           `drums` (start and open the browser), `drums post` / `drums artifact` fallbacks
  docs/
    spec.md        this file
    mockup.html    the clickable mockup
```

### 3.3 `protocol`

Plain types and zod schemas: `Workspace`, `Agent`, `AgentStatus`, `RoleId`, `Artifact`, `ArtifactVersion`, `Post` (a union: `note | version | checkpoint`), `Focus`, `Feedback`, `Answer`, `DomainEvent` (a union), and the request and response bodies of the HTTP API. Nothing else.

### 3.4 `core`

```
core/src/
  ports/            interfaces only
    agent-backend.ts   start a session, send a message, interrupt, resume; streams AgentEvents
    store.ts           workspaces, agents, posts, artifacts, answers
    git.ts             worktrees, branches, push
    code-review.ts     the subset of dyffle drums uses (see §7)
    role-picker.ts     goal → [{ role, instruction }]
    clock.ts, ids.ts
  roles/            the role registry
    registry.ts
    scoper.ts  researcher.ts  designer.ts  coder.ts  reviewer.ts
  tools/            the tool registry; handlers call services, never adapters directly
    registry.ts
    post.ts  artifact-list.ts  artifact-read.ts  artifact-create.ts  artifact-update.ts
    checkpoint.ts  impact.ts  request-input.ts  feed.ts
  artifacts/        artifact kinds registry (html, branch-map), versioning, conflict check
  workspaces/       create, open, archive; status aggregation
  agents/           AgentService: lifecycle, context injection, end-of-turn checks
  feedback/         collecting answers, routing Send to authors, the feedback message format
  focus/            turning a Focus into the block sent with a message
  events/           typed event bus
  index.ts
```

**A role is data plus a prompt**, so adding one never touches the core:

```ts
export interface RoleDefinition {
  id: RoleId;                       // 'reviewer'
  name: string;                     // 'Reviewer'
  summary: string;                  // used by the role picker to choose roles
  prompt: string;                   // the role prompt, including its work loop
  tools: ToolId[];                  // which registered tools it gets
  needsRepo?: boolean;              // Coder: true
  access?: SystemAccess;            // what it can touch besides its tools (§4.1)
  defaultArtifactKind?: ArtifactKindId;
}
```

**A tool is a schema, a description written for the agent, and a handler:**

```ts
export interface ToolDefinition<I> {
  id: ToolId;
  description: string;              // says WHEN to use it, not only what it does (§6.1)
  input: z.ZodType<I>;
  handle(input: I, ctx: ToolContext): Promise<ToolResult>;  // ctx carries workspace, calling agent, services
}
```

**An artifact kind** declares how versions are stored and validated, and which frontend renderer shows it. The two kinds are `html` and `branch-map`. A future kind, such as a table or a diagram, is one more entry.

### 3.5 `server`

```
server/src/
  main.ts                 composition root
  adapters/
    claude/               AgentBackend on the Claude Agent SDK; RolePicker on the Anthropic API
    fs-store/             Store on .drums/ files
    git/                  Git via execa
    dyffle/               CodeReview: one LiveSession per worktree (§7)
  mcp/
    sdk-tools.ts          exposes the tool registry as the Agent SDK's in-process tool server
    stdio.ts              the same registry as a standalone MCP server (@modelcontextprotocol/sdk), for other clients
  http/
    app.ts                Hono app
    routes/               one file per resource: workspaces, agents, messages, artifacts, answers, feedback, map, prs
    stream.ts             Server-Sent Events: domain events per workspace
```

The two MCP files are **adapters over the same tool registry**. A tool is written once.

### 3.6 `web`

Vue 3, Vite and TypeScript, with Pinia.

```
web/src/
  api/          typed client for the HTTP API, plus the live-update subscription
  stores/       one Pinia store per concept: workspaces, agents, threads, artifacts, answers, map, ui
  components/
    layout/     AppHeader, WorkspaceStrip, ChatRail, ArtifactStage, ChatFab
    chat/       AgentTabs, Thread, PostCard, Composer, FocusChip, StepsToggle
    artifacts/  ArtifactTabs, VersionPicker, renderers/ (one per artifact kind: HtmlArtifact, BranchMap)
    map/        MapFrame, DiffSheet
    dialogs/    NewWorkspace, AddAgent, SendPopover, OpenPrs
  renderers.ts  artifact kind → renderer component registry (mirrors core's kinds)
```

- **HTML artifacts** render in a sandboxed iframe that may run scripts but nothing else. `artifact-kit`'s bridge script inside it reports control values over `postMessage`. Never inject artifact HTML into the app's own page.
- **The branch map**, at first: the dyffle viewer in an iframe, served by the drums server from the session's data.
- **Styling:** plain CSS with the dyffle viewer's color tokens, which live in `artifact-kit` so the app and the artifacts share them, including dark mode.

---

## 4. Agents

### 4.1 Lifecycle

- **Starting:** `AgentService.start(workspace, role, instruction)` opens a session through the `AgentBackend`, with:
  - the workspace folder as working directory
  - the role prompt and the artifact contract (§5.1)
  - the role's tools
- **Saving:** the session id is stored, so agents resume after a restart.
- **Status:** `running` while a turn is in progress, `review` when it ends normally, `input` after `request_input` or while a permission prompt waits, `idle` after Stop or a PR.
- **Handover:** an agent calls `handover` when its part is done, and drums continues with that role's newest open agent, or starts one if it has none. It is recorded when the tool is called and fires only when the turn really ends: after the end-of-turn checks and any nudge they cause, with outcome success and no Stop or `request_input`. Anything else drops it. A role with `handoverNeedsOk` (the Coder) gets an allow/deny row in the sender's thread first. A receiver that is running or waiting on you refuses it, as does a fourth handover in a row (a message or Send resets the count), and a refusal shows in the sender's thread with the sender on `input`. After a handover that fired the sender goes `idle`, not `review`, since `review` would claim the workspace is ready while the next agent works. The receiver gets the instruction in a `<drums-handover from="…">` block.
- **Stop** interrupts the session.
- **Close** ends the session for good and takes the agent's tab away. What it posted stays, and its name still shows on it.
- **Access:** `shell-and-files`, which every role has, is the user's own Claude Code setup: shell, files, web, MCP servers, skills, plugins, hooks and CLAUDE.md. Only `AskUserQuestion` and plan mode stay off, since `request_input` does that job. Sessions run in `auto`: a classifier approves or denies each call, and what it can't decide sets the agent to `input` with an allow/deny row in its thread. Without `auto` on the account or model, everything that needs approval gets a row. The working directory is not a security boundary. `tools-only` remains for a role that should have nothing but its tools. Changing code stays the Coder's job, by its prompt.
- **Tool steps** stream as events and fill the Steps view.

> The Claude Agent SDK's exact function and option names must be checked against its docs (`code.claude.com/docs/en/agent-sdk`) when writing `adapters/claude`. Nothing outside that folder may depend on them.

### 4.2 Context the agent gets

- **First turn:** a short workspace overview: goal, the other agents and their roles, the roles it can hand over to, each artifact with its latest version and author, the last few posts, and on code the branch and a change summary. It contains pointers, not content; the agent fetches detail with its tools.
- **Every message:** a focus block in front of the user's text:

  ```
  <drums-focus>
    artifact: a1 "Scope: Checkout v2", viewing v2 (latest, by Scoper)
  </drums-focus>
  review this
  ```

  The composer shows that focus as a removable chip (`About: Scope: Checkout v2 · v2 ×`), so the user sees what "this" means. With no focus and several artifacts, the agent asks via `request_input` instead of guessing.

### 4.3 End-of-turn checks

Prompts are followed most of the time, not always, so the app checks when a turn ends:

- **Changed files with no checkpoint since:** the agent gets one short system message telling it to post a checkpoint. If it still doesn't, drums posts one for it ("Uncheckpointed changes", attributed to that agent).
- **An artifact file written without `artifact_update`:** the same nudge.
- **Counting:** each nudge is counted per role. Frequent nudges mean the role prompt or the tool description needs fixing.

Implement these as one `TurnCheck` registry in `core/agents`, so new checks are one file each.

### 4.4 Picking roles

drums never asks which agents to start.

- **New workspace:** one model call with structured output reads the goal and returns `[{ role, instruction }]`, choosing from the role registry's `summary` fields, so new roles are picked up automatically. A Coder is only chosen when repos are attached. If the call returns nothing usable, start a Scoper.
- **Add agent:** the same call with "pick exactly one", given the instruction and the workspace overview.
- **Through the API:** `POST /api/workspaces` may name `agents` itself, for callers that run a fixed workflow. Then there is no model call: exactly those agents start with exactly that text, and the request's `title`, if any, is the title. An unknown role, or one that needs a repo when none is attached, refuses the request before anything is created.

Use the current default Claude model (`claude-opus-5-5`) unless configured otherwise, and keep the model id in config, not in code.

---

## 5. Artifacts and feedback

### 5.1 The artifact contract (goes into every role prompt)

- **HTML:** a fragment, no `<html>` or `<head>`. Use `artifact-kit`'s classes and color tokens so it follows light and dark mode. No network requests.
- **Answers:** every `input`, `select` and `textarea` with a `name` is an answer. Put `data-label` on its container; that's what the Send panel shows. The value as posted is the default, and only changed values are pending.
- **Changes:** mark sections changed since the previous version with `class="chg"`. Give every version a one-line `note`.
- **Sharing:** artifacts are shared. `artifact_update` takes `base_version` and is refused if a newer version exists. The refusal returns the latest version, and the agent merges into it and retries.

### 5.2 Send

**Send** groups pending input by recipient:
- answers go to the agent that posted the artifact's **latest** version
- code line comments go to the agent that posted the last checkpoint, or else the Coder
- the overall note goes along with the first group

If a recipient is running, Send is refused with a message instead of interrupting it. Each recipient gets one message:

```
<drums-feedback artifact="a1" title="Scope: Checkout v2" version="2">
  <answer name="q-psp" label="Wallet payments provider">Stripe</answer>
  <answer name="scope-promo" label="Promo codes in checkout">in</answer>
  <overall>Keep it small</overall>
</drums-feedback>
```

Line comments use the Markdown that `dyffle comments` produces.

---

## 6. Tools

| Tool | Does | Notes |
|---|---|---|
| `post({title, message})` | a note in the agent's thread | Markdown; `` `symbols` `` link to the map |
| `artifact_list()` | `[{id, title, kind, latest, by}]` | |
| `artifact_read({id, version?})` | `{html, version, by, note}` | |
| `artifact_create({title, html, note})` | `{id, version: 1}` | |
| `artifact_update({id, base_version, html, note})` | `{version}` or a conflict with the latest | |
| `checkpoint({title, message})` | a branch-map version across the repos it touched | dyffle post with `change: true` |
| `impact({target?})` | dyffle `query()`: callers, routes, tests, breakage; no target = branch summary | needs dyffle plan items 1–3 |
| `request_input({reason})` | sets the agent to Needs input | |
| `handover({role, instruction})` | passes the work to another role when this turn ends | one per turn; see §4.1 |
| `feed({since?})` | other agents' posts in this workspace | for coordination |

The tool server knows the calling agent, so attribution is automatic.

### 6.1 Tool descriptions

Each description says **when** to call the tool. Example:

```
checkpoint: Post a checkpoint of the branch so the user can review it on the map.
Call it after each coherent step (a feature step, a fix, a refactor) once the
tests you ran pass, and always before you end your turn if you changed files
since your last checkpoint. The message says what changed, why, and what to look at;
put symbols and files in backticks.
```

Role prompts describe the work loop around the tools. For the Coder: small steps; after each, run the tests, call `impact`, then `checkpoint`; end every turn with a checkpoint or a `request_input`.

---

## 7. Code workspaces and dyffle

drums uses dyffle as a library and **owns its lifecycle**. Agents never start `dyffle watch`. The dyffle-side changes are planned in `../dyff/docs/plans/drums-support.md`.

- **Creating:** `git worktree add` per repo into the workspace folder, all on the workspace branch, each from the base branch picked for that repo.
- **Sessions:** one `LiveSession` per worktree with `baseRef` set to its base branch. drums calls `announce()` with its own URL, so `dyffle post` and `dyffle comments` still work from an agent's shell. `subscribe()` events (`live`, `feed`, `status`, `review`) become domain events.
- **Pausing:** only workspaces that are open or have a running agent keep sessions. The rest are stopped and resumed on demand (dyffle item 5). The base-index cache is shared across worktrees (dyffle item 4).
- **The branch map** combines the repos' merged indexes, one band per repo. The map does not track which agent changed what.
- **Reviews:**
  - comments and Viewed state stay in each worktree's `.dyffle/reviews/`
  - drums reads and writes them through the session (`review()` / `saveReview()`)
  - Send routes them (§5.2)
- **PRs:** one per repo with changes, the same title, linked to each other, each with its dyffle report embedded between the `dyffle:start`/`dyffle:end` markers (`markdownReport` + `embedSection`). After opening, agents that were ready for review go idle and the workspace shows `PR #n open`.
- **All of this sits behind the `CodeReview` and `Git` ports.** `core` never imports dyffle.

---

## 8. Storage

All state is files, so it is inspectable and survives restarts. Behind the `Store` port, so a database can replace it later.

```
~/.drums/
  config.json                 projects (repo paths), workspaces root, model ids
<workspaces root>/<workspace-slug>/
  .drums/
    workspace.json            goal, repos, branch, bases, agents (role, session id, status)
    posts/0007.json           the feed (one file per post)
    artifacts/<id>/meta.json  title, kind, whether it is archived
    artifacts/<id>/v3.html    versions are immutable
    artifacts/<id>/v3.json    author, note, time
    answers/<id>-v3.json      pending answers, so a reload keeps them
    images/<id>.png           images pasted into the composer, immutable
  <repo>/                     a worktree per attached repo (its own .dyffle/ inside)
```

Write atomically (temp file plus rename). Never rewrite a version file.

---

## 9. HTTP API (outline)

REST for actions, one Server-Sent Events stream per open workspace for everything that changes.

```
GET    /api/workspaces                      list (for the strip)
POST   /api/workspaces                      { goal, repos: [{ name, base }], branch?, title?, agents?: [{ role, instruction }] }
GET    /api/workspaces/:ws                  full state for one workspace
GET    /api/workspaces/:ws/stream           SSE: DomainEvent
POST   /api/workspaces/:ws/agents           { instruction }  → role picked by drums
POST   /api/workspaces/:ws/archive          stops its agents; worktrees, branches and posts stay
POST   /api/workspaces/:ws/restore
POST   /api/workspaces/:ws/agents/:a/messages   { text, focus?, images? }
POST   /api/workspaces/:ws/agents/:a/stop
POST   /api/workspaces/:ws/agents/:a/close
GET    /api/workspaces/:ws/images/:name     a pasted image
GET    /api/workspaces/:ws/artifacts/:id/versions/:v
POST   /api/workspaces/:ws/artifacts/:id/archive   a new version brings it back
POST   /api/workspaces/:ws/artifacts/:id/restore
PUT    /api/workspaces/:ws/artifacts/:id/answers  { version, answers }
POST   /api/workspaces/:ws/send             { overall? }  → routes pending feedback
GET    /api/workspaces/:ws/map/...          the dyffle LiveSource data for the map iframe
POST   /api/workspaces/:ws/prs              { title, repos: [{ name, body }] }
```

One route file per resource, each registered in `http/app.ts`.

---

## 10. Stack

| Concern | Choice |
|---|---|
| Language and runtime | TypeScript, Node 20+, ESM (same as dyffle) |
| Monorepo | npm or pnpm workspaces |
| HTTP | Hono with its Node adapter; typed client shared with `web` |
| Live updates | Server-Sent Events |
| Agents | Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`), only inside `adapters/claude` |
| Role picker | Anthropic API (`@anthropic-ai/sdk`) with structured output, only inside `adapters/claude` |
| MCP | the Agent SDK's in-process tool server; `@modelcontextprotocol/sdk` for the stdio variant |
| Validation | zod |
| Git | `execa` around `git` |
| Code review | `dyffle` (library) |
| Frontend | Vue 3, Vite, Pinia, plain CSS with shared tokens |
| Tests | Vitest (core with fakes; adapters with temp dirs); Playwright later |

---

## 11. Milestones

Each milestone ends in something usable. Don't start the next before the current one works end to end.

1. **M0, scaffold.** All packages, build, lint, tests, an empty composition root, `drums` starts a server and opens the browser with the header, strip and an empty stage. The registries exist with one dummy entry each.
2. **M1, one agent, HTML artifacts.**
   - Create a workspace (no repos), with one Scoper started by default and no role picker yet.
   - The thread shows the agent's posts and steps, and the composer sends messages.
   - The tools `post`, `artifact_*` and `request_input` work.
   - Artifacts render in the sandboxed iframe, with versions, change highlighting and pending answers.
   - Send delivers feedback, and the agent posts the next version.
3. **M2, several agents.** Agent tabs, add agent, status aggregation, the focus block and chip, the first-turn overview, routing Send to authors, `artifact_update` conflicts, `feed`.
4. **M3, code.** Repos and worktrees, the dyffle sessions, the branch map in an iframe, `checkpoint`, line comments and Viewed, PRs. `impact` once dyffle items 1–3 land.
5. **M4, autonomy.** The role picker, end-of-turn checks, pausing idle dyffle sessions, the collapsible rail and phone layout, resume after restart.

---

## 12. Not decided yet

- Cost and usage display per agent and per workspace.
- Deleting workspaces, including removing worktrees. Archiving keeps them.
- Splitting the dyffle map into an importable module, replacing the iframe (later, in dyffle).

## 13. Not in scope

Hosting or multi-user use, authentication, other model providers, and editing artifacts by hand in the UI.
