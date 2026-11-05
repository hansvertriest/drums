import { createArtifactKindRegistry, createEventBus, createRoleRegistry, createServices, createToolRegistry, createTurnCheckRegistry, type AgentBackend, type CodeReview, type Git, type PullRequests, type RolePicker } from '@drums/core';
import { createClaudeBackend } from './adapters/claude/backend.js';
import { createClaudeRolePicker } from './adapters/claude/role-picker.js';
import { createDyffleCodeReview } from './adapters/dyffle/code-review.js';
import { createFsStore } from './adapters/fs-store/store.js';
import { createLockfileDependencies } from './adapters/dependencies/lockfile.js';
import { createExecaGit } from './adapters/git/git.js';
import { createGhPullRequests } from './adapters/git/github.js';
import { createSystemClock } from './adapters/system/clock.js';
import { createConfigProjects } from './adapters/system/config-projects.js';
import { createUuidIds } from './adapters/system/ids.js';
import { loadConfig, type ConfigOverrides } from './config.js';
import { createApp } from './http/app.js';
import { listen } from './http/listen.js';

export interface DrumsOptions extends ConfigOverrides {
  port: number;
  /** Defaults to loopback: there is no auth, and an agent backend sits behind the API. */
  host?: string;
  webRoot: string;
  /** Replaces the Claude backend; tests use it so they never reach the model. */
  agentBackend?: AgentBackend;
  /** Replaces the model call that picks roles; tests use it so they never reach the model. */
  rolePicker?: RolePicker;
  /** Replaces `gh`; tests use it so they never reach a remote. */
  pullRequests?: PullRequests;
  /** Replace the adapters on git and dyffle. */
  git?: Git;
  codeReview?: CodeReview;
}

export interface RunningDrums {
  url: string;
  stop(): Promise<void>;
}

const DEFAULT_HOST = '127.0.0.1';

/** What drums starts when the role picker returns nothing usable (spec §4.4). */
const FIRST_ROLE = 'scoper';

/** The composition root: the one place that builds adapters, registries and services. */
export async function main(options: DrumsOptions): Promise<RunningDrums> {
  const { port, host = DEFAULT_HOST, webRoot, agentBackend, rolePicker, pullRequests, git, codeReview, ...overrides } = options;
  const config = loadConfig(overrides);
  const clock = createSystemClock();
  const ids = createUuidIds();
  const events = createEventBus();
  const roles = createRoleRegistry();
  const tools = createToolRegistry();
  const artifactKinds = createArtifactKindRegistry();
  const mapToken = ids.next();
  /** Known once it listens. Nothing opens a code session before that. */
  let origin = '';
  const services = createServices({
    store: createFsStore(config.workspacesRoot),
    backend: agentBackend ?? createClaudeBackend({ model: config.models.agent }),
    events,
    clock,
    ids,
    roles,
    tools,
    artifactKinds,
    turnChecks: createTurnCheckRegistry(),
    // The key goes to the SDK's client and nowhere else. Without one, the picker runs on the machine's Claude Code login.
    rolePicker: rolePicker ?? createClaudeRolePicker({ model: config.models.rolePicker, apiKey: process.env.ANTHROPIC_API_KEY }),
    git: git ?? createExecaGit(),
    dependencies: createLockfileDependencies(),
    pullRequests: pullRequests ?? createGhPullRequests(),
    projects: createConfigProjects(config.projects),
    codeReview: codeReview ?? createDyffleCodeReview({ baseCacheDir: config.baseCacheDir }),
    viewerUrl: (workspace, repo) => `${origin}/map/${mapToken}/${workspace}/${repo}/`,
    firstRole: FIRST_ROLE,
    sessionGraceMs: config.sessionGraceMs,
  });
  await services.agents.recover();

  const app = createApp({ clock, ids, mapToken, host, events, roles, tools, artifactKinds, services }, { webRoot, host });
  const listening = await listen(app, port, host);
  origin = `http://${host}:${listening.port}`;
  return {
    url: `http://${host}:${listening.port}/`,
    async stop() {
      await services.close();
      await listening.close();
    },
  };
}
