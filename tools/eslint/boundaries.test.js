import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint();

async function lint(path, code) {
  const [result] = await eslint.lintText(code, { filePath: path });
  return result.messages
    .filter((m) => m.ruleId === 'drums/boundaries' || m.ruleId === 'no-restricted-syntax')
    .map((m) => m.message);
}

const violations = [
  ['upward: core imports server', 'packages/core/src/a.ts', "import '@drums/server';"],
  ['core does no I/O', 'packages/core/src/a.ts', "import 'node:fs';"],
  ['core has no other dependencies', 'packages/core/src/a.ts', "import 'hono';"],
  ['protocol depends on nothing internal', 'packages/protocol/src/a.ts', "import '@drums/core';"],
  ['web does not import core', 'packages/web/src/a.ts', "import '@drums/core';"],
  ['deep import', 'packages/server/src/a.ts', "import '@drums/core/src/ports/clock.js';"],
  ['relative path across packages', 'packages/server/src/a.ts', "import '../../core/src/index.js';"],
  ['dyffle outside its adapter', 'packages/server/src/http/a.ts', "import 'dyffle';"],
  ['dyffle in core', 'packages/core/src/a.ts', "export * from 'dyffle';"],
  ['agent SDK outside its adapter', 'packages/server/src/a.ts', "import '@anthropic-ai/claude-agent-sdk';"],
  ['Anthropic SDK outside its adapter', 'packages/server/src/a.ts', "void import('@anthropic-ai/sdk');"],
  ['adapter imported outside main.ts', 'packages/server/src/http/a.ts', "import '../adapters/system/clock.js';"],
  ['switch over a role', 'packages/core/src/a.ts', "export const f = (role: string) => { switch (role) { default: } };"],
  ['switch over a kind', 'packages/core/src/a.ts', "export const f = (a: { kind: string }) => { switch (a.kind) { default: } };"],
  ['module-level instance', 'packages/core/src/a.ts', 'export const bus = new Map();'],
  ['module-level factory call', 'packages/server/src/a.ts', 'const bus = createEventBus(); export { bus };'],
  ['module-level let', 'packages/core/src/a.ts', 'export let count = 0;'],
];

const allowed = [
  ['core uses protocol and zod', 'packages/core/src/a.ts', "import '@drums/protocol'; import 'zod';"],
  ['core tests use vitest', 'packages/core/src/a.test.ts', "import 'vitest';"],
  ['web uses artifact-kit and vue', 'packages/web/src/a.ts', "import '@drums/artifact-kit'; import 'vue';"],
  ['dyffle in its adapter', 'packages/server/src/adapters/dyffle/a.ts', "import 'dyffle';"],
  ['agent SDK in its adapter', 'packages/server/src/adapters/claude/a.ts', "import '@anthropic-ai/claude-agent-sdk';"],
  ['main.ts wires adapters', 'packages/server/src/main.ts', "import './adapters/system/clock.js';"],
  ['a factory inside a function', 'packages/server/src/a.ts', 'export const f = () => { const m = new Map(); return m; };'],
  ['a registry list', 'packages/core/src/a.ts', 'export const roles = [{ id: "dummy" }];'],
];

describe('architecture lint', () => {
  it.each(violations)('rejects %s', async (_name, path, code) => {
    expect(await lint(path, code)).not.toEqual([]);
  });

  it.each(allowed)('allows %s', async (_name, path, code) => {
    expect(await lint(path, code)).toEqual([]);
  });
});
