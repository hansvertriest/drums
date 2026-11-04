import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { z } from 'zod';

/** `config.json` in the drums home. Everything is optional; `projects` joins with M3. */
const ConfigFile = z.object({
  workspacesRoot: z.string().min(1).optional(),
  models: z.object({ agent: z.string().min(1).optional() }).optional(),
});

const DEFAULT_AGENT_MODEL = 'claude-opus-5-5';

export interface DrumsConfig {
  home: string;
  workspacesRoot: string;
  models: { agent: string };
}

export interface ConfigOverrides {
  home?: string;
  workspacesRoot?: string;
}

type Env = Record<string, string | undefined>;

function readConfigFile(path: string): z.infer<typeof ConfigFile> {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw error;
  }
  const parsed = ConfigFile.safeParse(JSON.parse(text));
  if (!parsed.success) throw new Error(`${path} is not valid: ${parsed.error.message}`);
  return parsed.data;
}

/** Options win over the environment (`DRUMS_HOME`, `DRUMS_WORKSPACES_ROOT`, `DRUMS_AGENT_MODEL`), which wins over the file. */
export function loadConfig(overrides: ConfigOverrides = {}, env: Env = process.env): DrumsConfig {
  const home = resolve(overrides.home ?? env.DRUMS_HOME ?? join(homedir(), '.drums'));
  const file = readConfigFile(join(home, 'config.json'));
  return {
    home,
    workspacesRoot: resolve(overrides.workspacesRoot ?? env.DRUMS_WORKSPACES_ROOT ?? file.workspacesRoot ?? join(home, 'workspaces')),
    models: { agent: env.DRUMS_AGENT_MODEL ?? file.models?.agent ?? DEFAULT_AGENT_MODEL },
  };
}
