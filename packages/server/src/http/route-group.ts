import type { ArtifactKindRegistry, Clock, EventBus, Ids, RoleRegistry, Services, ToolRegistry } from '@drums/core';
import type { Hono } from 'hono';

/** Everything a route group may use. Built once, in `main.ts`. */
export interface HttpDeps {
  clock: Clock;
  ids: Ids;
  /** The secret in the map's URLs: its frames have no origin to check, so this is what lets them in. */
  mapToken: string;
  /** The interface the server is bound to. */
  host: string;
  /** Extra hostnames this server answers to, for a proxy in front of it. */
  allowedHosts: readonly string[];
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
