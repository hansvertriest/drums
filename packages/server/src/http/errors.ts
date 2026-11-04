import { ConflictError, InvalidError, NotFoundError } from '@drums/core';
import type { ApiError } from '@drums/protocol';
import type { ErrorHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

const STATUS: ReadonlyArray<[new (message: string) => Error, ContentfulStatusCode]> = [
  [InvalidError, 400],
  [NotFoundError, 404],
  [ConflictError, 409],
];

/** Refusals explain themselves. Anything else is a bug: logged here, and no details leave the server. */
export const onError: ErrorHandler = (error, c) => {
  const status = STATUS.find(([type]) => error instanceof type)?.[1];
  if (status) return c.json({ error: error.message } satisfies ApiError, status);
  console.error(error);
  return c.json({ error: 'Something went wrong on the server.' } satisfies ApiError, 500);
};
