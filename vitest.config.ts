import { resolve } from 'node:path';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

const src = (name: string) => resolve(import.meta.dirname, `packages/${name}/src/index.ts`);

// Tests run against sources, so they need no build first.
const alias = {
  '@drums/protocol': src('protocol'),
  '@drums/core': src('core'),
  '@drums/server': src('server'),
  '@drums/artifact-kit': src('artifact-kit'),
};

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'node',
          environment: 'node',
          include: ['packages/*/src/**/*.test.ts', 'tools/**/*.test.js'],
          exclude: ['packages/web/**'],
        },
      },
      {
        plugins: [vue()],
        resolve: { alias },
        test: {
          name: 'web',
          environment: 'happy-dom',
          include: ['packages/web/src/**/*.test.ts'],
        },
      },
    ],
  },
});
