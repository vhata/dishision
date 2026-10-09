import type { RecommendationDto } from '../../shared/api';

export interface RecommendationRow {
  id: string;
  sessionId: string;
  payload: { primary: RecommendationDto; runnerUp: RecommendationDto | null };
  feedbackReason: string | null;
}

export async function insertRecommendation(db: D1Database, row: { id: string; sessionId: string; payload: RecommendationRow['payload']; trace: unknown }): Promise<void> {
  await db
    .prepare('INSERT INTO recommendations (id, session_id, payload, trace, created_at) VALUES (?1, ?2, ?3, ?4, ?5)')
    .bind(row.id, row.sessionId, JSON.stringify(row.payload), JSON.stringify(row.trace), new Date().toISOString())
    .run();
}

export async function setFeedback(db: D1Database, id: string, reason: string): Promise<void> {
  await db.prepare('UPDATE recommendations SET feedback_reason = ?2 WHERE id = ?1').bind(id, reason).run();
}

export async function latestRecommendation(db: D1Database, sessionId: string): Promise<RecommendationRow | null> {
  const row = await db
    .prepare('SELECT id, session_id, payload, feedback_reason FROM recommendations WHERE session_id = ?1 ORDER BY created_at DESC LIMIT 1')
    .bind(sessionId)
    .first<{ id: string; session_id: string; payload: string; feedback_reason: string | null }>();
  return row ? { id: row.id, sessionId: row.session_id, payload: JSON.parse(row.payload), feedbackReason: row.feedback_reason } : null;
}
