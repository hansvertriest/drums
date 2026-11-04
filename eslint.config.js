import vue from 'eslint-plugin-vue';
import tseslint from 'typescript-eslint';
import { drumsPlugin } from './tools/eslint/boundaries.js';

const TS_RULES_FILES = ['packages/*/src/**/*.ts'];

// Spec §3.1: registries instead of switches, the composition root instead of singletons.
const architectureSyntax = [
  {
    selector: 'SwitchStatement[discriminant.name=/role|kind/i], SwitchStatement[discriminant.property.name=/role|kind/i]',
    message: 'No switch over role or kind names: add an entry to the registry instead.',
  },
  ...['Program', 'Program > ExportNamedDeclaration'].flatMap((parent) => [
    {
      selector: `${parent} > VariableDeclaration[kind='let']`,
      message: 'No module-level mutable state: pass it in from the composition root.',
    },
    {
      selector: `${parent} > VariableDeclaration > VariableDeclarator > NewExpression`,
      message: 'No module-level singletons: build it in the composition root.',
    },
    {
      selector: `${parent} > VariableDeclaration > VariableDeclarator > CallExpression[callee.name=/^create/]`,
      message: 'No module-level singletons: build it in the composition root.',
    },
  ]),
];

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '.dyffle/**', '.drums/**', 'docs/**'] },
  ...tseslint.configs.recommended,
  ...vue.configs['flat/essential'],
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
  {
    files: ['packages/*/src/**/*.ts', 'packages/*/src/**/*.vue'],
    plugins: { drums: drumsPlugin },
    rules: { 'drums/boundaries': 'error' },
  },
  {
    files: TS_RULES_FILES,
    ignores: ['**/*.test.ts'],
    rules: { 'no-restricted-syntax': ['error', ...architectureSyntax] },
  },
  {
    files: ['scripts/**', 'tools/**'],
    languageOptions: { globals: { console: 'readonly', process: 'readonly', URL: 'readonly' } },
  },
);
