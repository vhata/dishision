import { Hono } from 'hono';
import { buildDeps, type Deps } from './deps';
import type { Env } from './env';
import { sessionRoutes, type AppContext } from './routes/session';

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
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'internal', message: err.message }, 500);
});

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Env>;
