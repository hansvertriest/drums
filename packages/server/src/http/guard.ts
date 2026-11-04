import type { Context, MiddlewareHandler } from 'hono';

const LOOPBACK = ['127.0.0.1', 'localhost', '[::1]'];

const hostnameOf = (host: string) => host.replace(/:\d+$/, '');

const refuse = (c: Context) => c.json({ error: 'This server only answers its own page.' }, 403);

/**
 * There is no auth and an agent backend sits behind the API, so a web page the user happens
 * to have open must not reach it. `Host` stops DNS rebinding; `Origin` stops other sites and
 * sandboxed artifacts (whose origin is `null`), even with a body type that skips CORS preflight.
 */
export function sameOriginOnly(boundHost: string): MiddlewareHandler {
  const allowed = new Set([...LOOPBACK, boundHost]);
  return async (c, next) => {
    const host = c.req.header('host') ?? '';
    if (!allowed.has(hostnameOf(host))) return refuse(c);
    const origin = c.req.header('origin');
    if (origin !== undefined && origin !== `http://${host}`) return refuse(c);
    await next();
    return undefined;
  };
}
