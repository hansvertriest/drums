/** Refusals the HTTP layer and tools can explain. Anything else is a bug. */
export class NotFoundError extends Error {
  override readonly name = 'NotFoundError';
}

/** The request was fine but can't happen now, e.g. the recipient is running. */
export class ConflictError extends Error {
  override readonly name = 'ConflictError';
}

export class InvalidError extends Error {
  override readonly name = 'InvalidError';
}
