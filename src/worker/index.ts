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

/**
 * Routes return their client-facing errors directly; anything that reaches
 * here was thrown. An HTTPException is a deliberate client-facing error and
 * keeps its status and message, or its own response when it carries one.
 * Any other error is unexpected: its detail (which can name tables, columns
 * or stored data) goes to the log only, and the client gets a generic body
 * in the same ApiError shape.
 */
export const handleError: ErrorHandler = (err, c) => {
  if (err instanceof HTTPException) {
    if (err.status >= 500) console.error(err);
    if (err.res) return err.getResponse();
    return c.json({ error: 'http_error', message: err.message || undefined }, err.status);
  }
  console.error(err);
  return c.json({ error: 'internal', message: 'Something went wrong. Try again.' }, 500);
};
app.onError(handleError);

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Env>;
