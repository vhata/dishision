import { type ErrorHandler, Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { buildDeps, type Deps } from './deps';
import type { Env } from './env';
import { type AppContext, sessionRoutes } from './routes/session';

export const app = new Hono<AppContext>();

let deps: Deps | undefined;
app.use('/api/*', async (c, next) => {
  deps ??= buildDeps(c.env);
  c.set('deps', deps);
  await next();
});

app.get('/api/health', (c) => c.json({ ok: true }));
app.route('/api/session', sessionRoutes);

app.notFound((c) => c.json({ error: 'not_found' }, 404));

const GENERIC_MESSAGE = 'Something went wrong. Try again.';

/**
 * Routes return their client-facing errors directly; anything that reaches
 * here was thrown. A 4xx HTTPException is a deliberate client-facing error
 * and keeps its status and message (the generic one when it has none), or
 * its own response when it carries one. Everything else is a server-side
 * failure: its detail (which can name tables, columns, stored data or Hono
 * internals) goes to the log only, and the client gets the generic message
 * in the same ApiError shape, with the HTTPException's status if it had one.
 * A 5xx HTTPException's own response is discarded, not returned.
 */
export const handleError: ErrorHandler = (err, c) => {
  if (err instanceof HTTPException && err.status < 500) {
    if (err.res) return err.getResponse();
    return c.json({ error: 'http_error', message: err.message || GENERIC_MESSAGE }, err.status);
  }
  console.error(err);
  return c.json({ error: 'internal', message: GENERIC_MESSAGE }, err instanceof HTTPException ? err.status : 500);
};
app.onError(handleError);

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Env>;
