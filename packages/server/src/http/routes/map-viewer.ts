import { InvalidError, NotFoundError } from '@drums/core';
import { Hono, type MiddlewareHandler } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { isOurHost } from '../guard.js';
import type { RouteGroup } from '../route-group.js';
import { repoParam, workspaceParam } from '../validate.js';

const ReviewKey = z.string().regex(/^(live|post-\d+)$/);
const FilePath = z.string().min(1).max(4096);
const IndexPosition = z.coerce.number().int().nonnegative();
const Client = z.string().max(100).optional();
/** The most the viewer sends, as `dyffle serve` has it. */
const ReviewBody = z.string().max(1 << 20);

const HEARTBEAT_MS = 15_000;

function query<S extends z.ZodType>(schema: S, value: string | undefined): z.infer<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new InvalidError('Invalid request.');
  return parsed.data;
}

const found = (value: string | undefined) => {
  if (value === undefined) throw new NotFoundError('Not here.');
  return value;
};

const json = (body: string) => new Response(body, { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

/**
 * The page in the map's frame runs in a sandbox with no origin, so this part of the API can't go
 * under `/api`, which refuses that origin, and the frame can't go anywhere else: its policy
 * only lets it talk to this one repo's map. In the other direction, what stands between another
 * site and this data is the secret in the path, plus `Host` against DNS rebinding.
 */
const onlyWithToken = (token: string, host: string): MiddlewareHandler => async (c, next) => {
  if (c.req.param('token') !== token || !isOurHost(c.req.header('host'), host)) return c.text('Not found', 404);
  await next();
  c.res.headers.set('Access-Control-Allow-Origin', 'null');
  return undefined;
};

/** Also in the response, so the page has no origin even when it is opened outside its frame. */
const viewerCsp = (mapUrl: string, appUrl: string) =>
  [
    'sandbox allow-scripts allow-forms',
    "default-src 'none'",
    "script-src 'unsafe-inline'",
    "style-src 'unsafe-inline'",
    'img-src data:',
    'font-src data:',
    `connect-src ${mapUrl}`,
    "form-action 'none'",
    "base-uri 'none'",
    `frame-ancestors ${appUrl}`,
  ].join('; ');

/** What dyffle's viewer expects of a live server (its `LiveSource`), for one repo's session. */
export const mapViewerRoutes: RouteGroup = {
  path: '/map',
  create({ services, mapToken, host }) {
    const source = (c: Parameters<MiddlewareHandler>[0]) => services.code.mapSource(workspaceParam(c), repoParam(c));
    const at = '/:token/:ws/:repo';
    return new Hono()
      .use(`${at}/*`, onlyWithToken(mapToken, host))
      .options(`${at}/*`, (c) => {
        c.header('Access-Control-Allow-Methods', 'GET, PUT');
        c.header('Access-Control-Allow-Headers', 'content-type');
        return c.body(null, 204);
      })
      .get(`${at}/`, async (c) => {
        await source(c);
        const appUrl = `http://${c.req.header('host')}`;
        c.header('Content-Security-Policy', viewerCsp(`${appUrl}${new URL(c.req.url).pathname}`, appUrl));
        c.header('Cache-Control', 'no-store');
        return c.html(services.code.viewerHtml());
      })
      .get(`${at}/indexes.json`, async (c) => json(JSON.stringify((await source(c)).labels())))
      .get(`${at}/index.json`, async (c) => json(found((await source(c)).index(query(IndexPosition, c.req.query('i') ?? '0')))))
      .get(`${at}/feed.json`, async (c) => json((await source(c)).feed()))
      .get(`${at}/source.json`, async (c) =>
        json(found((await source(c)).source(query(ReviewKey, c.req.query('key')), query(FilePath, c.req.query('path'))))),
      )
      .get(`${at}/review.json`, async (c) => json(found((await source(c)).review(query(ReviewKey, c.req.query('key'))))))
      .put(`${at}/review.json`, async (c) => {
        const body = query(ReviewBody, await c.req.text());
        (await source(c)).saveReview(query(ReviewKey, c.req.query('key')), body, query(Client, c.req.query('client')));
        return c.body(null, 204);
      })
      .get(`${at}/events`, async (c) => {
        const map = await source(c);
        const workspace = workspaceParam(c);
        return streamSSE(c, async (stream) => {
          // This stream hangs on one session object: as long as it is connected, that one must keep running.
          const leave = services.code.view(workspace);
          const pending: Array<{ event: string; data: string }> = [];
          let wake = () => {};
          const unsubscribe = map.subscribe((event, data) => {
            pending.push({ event, data: JSON.stringify(data) });
            wake();
          });
          const heartbeat = setInterval(() => {
            pending.push({ event: 'ping', data: '' });
            wake();
          }, HEARTBEAT_MS);
          let ended = false;
          stream.onAbort(() => {
            ended = true;
            wake();
          });
          try {
            while (!ended) {
              const message = pending.shift();
              if (message) await stream.writeSSE(message);
              else await new Promise<void>((resolve) => (wake = resolve));
            }
          } finally {
            leave();
            clearInterval(heartbeat);
            unsubscribe();
          }
        });
      });
  },
};
