import { Hono } from 'hono';
import type { Env } from './env';

export const app = new Hono<{ Bindings: Env }>();

app.get('/api/health', (c) => c.json({ ok: true }));

app.notFound((c) => c.json({ error: 'not_found' }, 404));

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Env>;
