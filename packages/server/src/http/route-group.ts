import type { ArtifactKindRegistry, Clock, CodeReview, EventBus, Ids, RoleRegistry, Services, ToolRegistry } from '@drums/core';
import type { Hono } from 'hono';

/** Everything a route group may use. Built once, in `main.ts`. */
export interface HttpDeps {
  clock: Clock;
  ids: Ids;
  codeReview: CodeReview;
  events: EventBus;
  roles: RoleRegistry;
  tools: ToolRegistry;
  artifactKinds: ArtifactKindRegistry;
  services: Services;
}

export interface RouteGroup {
  /** Where it is mounted, e.g. `/api/workspaces`. */
  path: string;
  create(deps: HttpDeps): Hono;
}
