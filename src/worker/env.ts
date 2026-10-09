export interface Env {
  DB: D1Database;
  RESTAURANT_PROVIDER: 'fixture' | 'google';
  LLM_PROVIDER: 'fixture' | 'workers-ai';
  GEOCODER: 'fixture' | 'google';
  ADMIN_SECRET?: string;
}
