import { createArtifactKindRegistry, createEventBus, createRoleRegistry, createServices, createToolRegistry, type AgentBackend } from '@drums/core';
import { createClaudeBackend } from './adapters/claude/backend.js';
import { createDyffleCodeReview } from './adapters/dyffle/code-review.js';
import { createFsStore } from './adapters/fs-store/store.js';
import { createSystemClock } from './adapters/system/clock.js';
import { createUuidIds } from './adapters/system/ids.js';
import { createKeywordRolePicker } from './adapters/system/keyword-role-picker.js';
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
}

export interface RunningDrums {
  url: string;
  stop(): Promise<void>;
}

const DEFAULT_HOST = '127.0.0.1';

/** Every workspace starts with this role until the role picker picks for new ones too (M4). Add agent falls back on it. */
const FIRST_ROLE = 'scoper';

/** The composition root: the one place that builds adapters, registries and services. */
export async function main(options: DrumsOptions): Promise<RunningDrums> {
  const { port, host = DEFAULT_HOST, webRoot, agentBackend, ...overrides } = options;
  const config = loadConfig(overrides);
  const clock = createSystemClock();
  const ids = createUuidIds();
  const events = createEventBus();
  const roles = createRoleRegistry();
  const tools = createToolRegistry();
  const artifactKinds = createArtifactKindRegistry();
  const services = createServices({
    store: createFsStore(config.workspacesRoot),
    backend: agentBackend ?? createClaudeBackend({ model: config.models.agent }),
    events,
    clock,
    ids,
    roles,
    tools,
    artifactKinds,
    rolePicker: createKeywordRolePicker(),
    firstRole: FIRST_ROLE,
  });
  await services.agents.recover();

  const app = createApp(
    { clock, ids, codeReview: createDyffleCodeReview(), events, roles, tools, artifactKinds, services },
    { webRoot, host },
  );
  const listening = await listen(app, port, host);
  return {
    url: `http://${host}:${listening.port}/`,
    async stop() {
      services.agents.closeAll();
      await listening.close();
    },
  };
}
