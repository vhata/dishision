import type { ConversationState } from '../../core/questions';
import type { SessionStatus } from '../../shared/api';

export interface SessionRecord {
  id: string;
  ownerId: string | null;
  zipLabel: string;
  lat: number;
  lng: number;
  status: SessionStatus;
  state: ConversationState;
}

interface Row {
  id: string;
  owner_id: string | null;
  zip_label: string;
  lat: number;
  lng: number;
  prefs: string;
  asked: string;
  round2_asked: number;
  rejected_item_ids: string;
  status: SessionStatus;
}

function fromRow(r: Row): SessionRecord {
  return {
    id: r.id,
    ownerId: r.owner_id,
    zipLabel: r.zip_label,
    lat: r.lat,
    lng: r.lng,
    status: r.status,
    state: {
      prefs: JSON.parse(r.prefs),
      asked: JSON.parse(r.asked),
      round2Asked: r.round2_asked,
      rejectedItemIds: JSON.parse(r.rejected_item_ids),
    },
  };
}

export async function insertSession(db: D1Database, rec: SessionRecord): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO sessions (id, owner_id, zip_label, lat, lng, prefs, asked, round2_asked, rejected_item_ids, status, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)`,
    )
    .bind(
      rec.id, rec.ownerId, rec.zipLabel, rec.lat, rec.lng,
      JSON.stringify(rec.state.prefs), JSON.stringify(rec.state.asked), rec.state.round2Asked,
      JSON.stringify(rec.state.rejectedItemIds), rec.status, now,
    )
    .run();
}

export async function getSession(db: D1Database, id: string): Promise<SessionRecord | null> {
  const row = await db.prepare('SELECT * FROM sessions WHERE id = ?1').bind(id).first<Row>();
  return row ? fromRow(row) : null;
}

export async function saveSession(db: D1Database, rec: SessionRecord): Promise<void> {
  await db
    .prepare(
      `UPDATE sessions SET prefs = ?2, asked = ?3, round2_asked = ?4, rejected_item_ids = ?5, status = ?6, updated_at = ?7 WHERE id = ?1`,
    )
    .bind(
      rec.id, JSON.stringify(rec.state.prefs), JSON.stringify(rec.state.asked), rec.state.round2Asked,
      JSON.stringify(rec.state.rejectedItemIds), rec.status, new Date().toISOString(),
    )
    .run();
}
