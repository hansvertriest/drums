import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HealthResponse } from '@drums/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { main, type RunningDrums } from './main.js';

let webRoot: string;
let drums: RunningDrums;

beforeAll(async () => {
  webRoot = mkdtempSync(join(tmpdir(), 'drums-web-'));
  mkdirSync(join(webRoot, 'assets'));
  writeFileSync(join(webRoot, 'index.html'), '<title>drums</title>');
  writeFileSync(join(webRoot, 'assets', 'a.js'), 'export {};');
  drums = await main({ port: 0, host: '127.0.0.1', webRoot });
});

afterAll(async () => {
  await drums.stop();
  rmSync(webRoot, { recursive: true, force: true });
});

const get = (path: string) => fetch(new URL(path, drums.url));

describe('main', () => {
  it('serves the health route with the registries wired in', async () => {
    const response = await get('/api/health');
    expect(response.status).toBe(200);
    const body = HealthResponse.parse(await response.json());
    expect(body).toMatchObject({ roles: ['dummy'], tools: ['dummy'], artifactKinds: ['dummy'] });
  });

  it('answers unknown API paths with a 404, not the web app', async () => {
    expect((await get('/api/nope')).status).toBe(404);
  });

  it('serves the web app, its assets and falls back to index.html', async () => {
    expect(await (await get('/')).text()).toContain('drums');
    expect(await (await get('/assets/a.js')).text()).toContain('export');
    expect(await (await get('/some/page')).text()).toContain('drums');
  });

  it('refuses a port that is taken', async () => {
    const { port } = new URL(drums.url);
    await expect(main({ port: Number(port), host: '127.0.0.1', webRoot })).rejects.toThrow('EADDRINUSE');
  });
});
