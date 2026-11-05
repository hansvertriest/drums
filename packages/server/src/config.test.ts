import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'drums-config-'));
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

describe('loadConfig', () => {
  it('needs no file', () => {
    const config = loadConfig({ home }, {});
    expect(config.workspacesRoot).toBe(join(config.home, 'workspaces'));
    expect(config.models.agent).toBeTruthy();
  });

  it('takes the workspaces root and model from the file', () => {
    writeFileSync(join(home, 'config.json'), JSON.stringify({ workspacesRoot: '/w', models: { agent: 'm' } }));
    expect(loadConfig({ home }, {})).toMatchObject({ workspacesRoot: '/w', models: { agent: 'm' } });
  });

  it('keeps the role picker\'s model and the grace period in config, with defaults', () => {
    expect(loadConfig({ home }, {})).toMatchObject({ models: { rolePicker: 'claude-opus-5-5' }, sessionGraceMs: 60_000 });
    writeFileSync(join(home, 'config.json'), JSON.stringify({ models: { rolePicker: 'file-model' }, sessionGraceMs: 5 }));
    expect(loadConfig({ home }, {})).toMatchObject({ models: { rolePicker: 'file-model' }, sessionGraceMs: 5 });
    expect(loadConfig({ home }, { DRUMS_ROLE_PICKER_MODEL: 'env-model' }).models.rolePicker).toBe('env-model');
  });

  it('lets the environment and then options win', () => {
    writeFileSync(join(home, 'config.json'), JSON.stringify({ workspacesRoot: '/file' }));
    const env = { DRUMS_HOME: home, DRUMS_WORKSPACES_ROOT: '/env', DRUMS_AGENT_MODEL: 'env-model' };
    expect(loadConfig({}, env)).toMatchObject({ workspacesRoot: '/env', models: { agent: 'env-model' } });
    expect(loadConfig({ workspacesRoot: '/opt' }, env).workspacesRoot).toBe('/opt');
  });

  it('refuses a config file with the wrong shape', () => {
    writeFileSync(join(home, 'config.json'), JSON.stringify({ workspacesRoot: 3 }));
    expect(() => loadConfig({ home }, {})).toThrow('not valid');
  });
});
