import type { Context, MiddlewareHandler } from 'hono';

const LOOPBACK = ['127.0.0.1', 'localhost', '[::1]'];

const hostnameOf = (host: string) => host.replace(/:\d+$/, '');

/** A host on the list reaches us through a proxy that may end TLS. Loopback never does, even if it is listed. */
const isListed = (host: string, allowedHosts: readonly string[]) => {
  const name = hostnameOf(host);
  return allowedHosts.includes(name) && !LOOPBACK.includes(name);
};

const refuse = (c: Context) => c.json({ error: 'This server only answers its own page.' }, 403);

/**
 * There is no auth and an agent backend sits behind the API, so a web page the user happens
 * to have open must not reach it. `Host` stops DNS rebinding; `Origin` stops other sites and
 * sandboxed artifacts (whose origin is `null`), even with a body type that skips CORS preflight.
 * `allowedHosts` are the extra hostnames configured for a proxy in front of this server.
 */
export function isOurHost(host: string | undefined, boundHost: string, allowedHosts: readonly string[]): boolean {
  return [...LOOPBACK, boundHost, ...allowedHosts].includes(hostnameOf(host ?? ''));
}

/** The origin the browser sees. Only a listed host's proxy is believed about the scheme; anyone can send that header. */
export function browserOrigin(host: string | undefined, forwardedProto: string | undefined, allowedHosts: readonly string[]): string {
  const scheme = isListed(host ?? '', allowedHosts) && forwardedProto?.split(',')[0]?.trim().toLowerCase() === 'https' ? 'https' : 'http';
  return `${scheme}://${host}`;
}

export function sameOriginOnly(boundHost: string, allowedHosts: readonly string[]): MiddlewareHandler {
  return async (c, next) => {
    const host = c.req.header('host') ?? '';
    if (!isOurHost(host, boundHost, allowedHosts)) return refuse(c);
    const origin = c.req.header('origin');
    const accepted = isListed(host, allowedHosts) ? [`http://${host}`, `https://${host}`] : [`http://${host}`];
    if (origin !== undefined && !accepted.includes(origin)) return refuse(c);
    await next();
    return undefined;
  };
}
