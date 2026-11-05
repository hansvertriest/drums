import { InvalidError } from '@drums/core';
import { AgentId, ArtifactId, RepoName, VersionNumber, WorkspaceId } from '@drums/protocol';
import type { Context } from 'hono';
import type { z } from 'zod';

/** A request body, validated. An unusable one becomes a 400 in `http/errors.ts`. */
export async function parseBody<S extends z.ZodType>(c: Context, schema: S): Promise<z.infer<S>> {
  const body: unknown = await c.req.json().catch(() => {
    throw new InvalidError('The body is not JSON.');
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new InvalidError(`Invalid body: ${parsed.error.message}`);
  return parsed.data;
}

function param<S extends z.ZodType>(c: Context, name: string, schema: S): z.infer<S> {
  const parsed = schema.safeParse(c.req.param(name));
  if (!parsed.success) throw new InvalidError(`Invalid ${name}.`);
  return parsed.data;
}

export const workspaceParam = (c: Context) => param(c, 'ws', WorkspaceId);
export const agentParam = (c: Context) => param(c, 'a', AgentId);
export const repoParam = (c: Context) => param(c, 'repo', RepoName);
export const artifactParam = (c: Context) => param(c, 'id', ArtifactId);

export function versionParam(c: Context): VersionNumber {
  const parsed = VersionNumber.safeParse(Number(c.req.param('v')));
  if (!parsed.success) throw new InvalidError('Invalid version.');
  return parsed.data;
}
