import { createArtifactKindRegistry, createEventBus, createRoleRegistry, createToolRegistry } from '@drums/core';
import { createDyffleCodeReview } from './adapters/dyffle/code-review.js';
import { createSystemClock } from './adapters/system/clock.js';
import { createUuidIds } from './adapters/system/ids.js';
import { createApp } from './http/app.js';
import { listen } from './http/listen.js';

export interface DrumsOptions {
  port: number;
  host: string;
  webRoot: string;
}

export interface RunningDrums {
  url: string;
  stop(): Promise<void>;
}

/** The composition root: the one place that builds adapters, registries and services. */
export async function main({ port, host, webRoot }: DrumsOptions): Promise<RunningDrums> {
  const app = createApp(
    {
      clock: createSystemClock(),
      ids: createUuidIds(),
      codeReview: createDyffleCodeReview(),
      events: createEventBus(),
      roles: createRoleRegistry(),
      tools: createToolRegistry(),
      artifactKinds: createArtifactKindRegistry(),
    },
    { webRoot },
  );
  const listening = await listen(app, port, host);
  return { url: `http://${host}:${listening.port}/`, stop: listening.close };
}
