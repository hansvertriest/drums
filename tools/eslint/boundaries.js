// The dependency rules of spec §3, as a lint rule. The table below is the architecture.
import { builtinModules } from 'node:module';
import { dirname, relative, resolve, sep } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const SCOPE = '@drums/';
const BUILTINS = new Set(builtinModules);

/**
 * internal: the workspace packages it may import.
 * external: third-party imports it may use; `any` also allows Node's built-ins.
 */
const PACKAGES = {
  protocol: { internal: [], external: ['zod'] },
  'artifact-kit': { internal: [], external: [] },
  core: { internal: ['protocol'], external: ['zod'] },
  server: { internal: ['protocol', 'core'], external: 'any' },
  web: { internal: ['protocol', 'artifact-kit'], external: ['vue', 'pinia', '@vue/test-utils'] },
  cli: { internal: ['server'], external: 'any' },
};

/** Third-party packages only one folder may import. */
const CONFINED = [
  { pattern: /^dyffle(\/|$)/, folder: 'packages/server/src/adapters/dyffle' },
  { pattern: /^@anthropic-ai\/(claude-agent-sdk|sdk)(\/|$)/, folder: 'packages/server/src/adapters/claude' },
];

const SERVER_ADAPTERS = 'packages/server/src/adapters';
const SERVER_ROOT = 'packages/server/src/main.ts';

const inFolder = (path, folder) => path === folder || path.startsWith(`${folder}/`);
const isTest = (path) => /\.test\.ts$/.test(path);
const repoPath = (path) => relative(ROOT, path).split(sep).join('/');

function checkRelative(source, file, pkg) {
  const target = repoPath(resolve(ROOT, dirname(file), source));
  if (!inFolder(target, `packages/${pkg}`)) {
    return `'${source}' leaves @drums/${pkg}. Import another package by name, through its public API.`;
  }
  if (inFolder(target, SERVER_ADAPTERS) && !inFolder(file, SERVER_ADAPTERS) && file !== SERVER_ROOT && !isTest(file)) {
    return `Only the composition root imports adapters; '${source}' is imported from ${file}.`;
  }
  return undefined;
}

function checkPackage(source, file, pkg) {
  const rules = PACKAGES[pkg];
  if (source.startsWith(SCOPE)) {
    const [name, ...rest] = source.slice(SCOPE.length).split('/');
    if (rest.length > 0) return `No deep imports between packages: use '${SCOPE}${name}'.`;
    if (!rules.internal.includes(name)) return `@drums/${pkg} may not depend on ${source}.`;
    return undefined;
  }
  const confined = CONFINED.find(({ pattern }) => pattern.test(source));
  if (confined) {
    return inFolder(file, confined.folder) ? undefined : `'${source}' may only be imported in ${confined.folder}.`;
  }
  if (rules.external === 'any') return undefined;
  if (source.startsWith('node:') || BUILTINS.has(source)) {
    return isTest(file) ? undefined : `@drums/${pkg} may not use Node's '${source}'.`;
  }
  const name = source.split('/').slice(0, source.startsWith('@') ? 2 : 1).join('/');
  if (name === 'vitest' && isTest(file)) return undefined;
  return rules.external.includes(name) ? undefined : `@drums/${pkg} may not depend on '${source}'.`;
}

const boundaries = {
  meta: { type: 'problem', schema: [], messages: { violation: '{{message}}' } },
  create(context) {
    const file = repoPath(context.filename);
    const pkg = file.match(/^packages\/([^/]+)\//)?.[1];
    if (!pkg || !PACKAGES[pkg] || !file.includes('/src/')) return {};

    const check = (node) => {
      const source = node?.value;
      if (typeof source !== 'string') return;
      const message = source.startsWith('.') ? checkRelative(source, file, pkg) : checkPackage(source, file, pkg);
      if (message) context.report({ node, messageId: 'violation', data: { message } });
    };
    const checkSource = (node) => check(node.source);
    return {
      ImportDeclaration: checkSource,
      ExportNamedDeclaration: checkSource,
      ExportAllDeclaration: checkSource,
      ImportExpression: checkSource,
    };
  },
};

export const drumsPlugin = { rules: { boundaries } };
