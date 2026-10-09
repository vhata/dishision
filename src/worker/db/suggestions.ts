import type { DinnerPreferences } from '../../core/preferences';

export async function insertSuggestion(
  db: D1Database,
  s: { id: string; sessionId: string; nodeId: string; text: string; prefs: DinnerPreferences },
): Promise<void> {
  await db
    .prepare(`INSERT INTO suggestions (id, session_id, node_id, text, prefs_snapshot, status, created_at) VALUES (?1, ?2, ?3, ?4, ?5, 'pending', ?6)`)
    .bind(s.id, s.sessionId, s.nodeId, s.text, JSON.stringify(s.prefs), new Date().toISOString())
    .run();
}

export async function countSuggestions(db: D1Database, sessionId: string): Promise<number> {
  const row = await db.prepare('SELECT COUNT(*) AS n FROM suggestions WHERE session_id = ?1').bind(sessionId).first<{ n: number }>();
  return row?.n ?? 0;
}
