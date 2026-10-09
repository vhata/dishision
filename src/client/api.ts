import type { AnswerDto, ApiError, FeedbackReason, RecommendResponse, SessionDto } from '../shared/api';

export const isDebug = new URLSearchParams(window.location.search).get('debug') === '1';
const debugQuery = isDebug ? '?debug=1' : '';

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiError,
  ) {
    super(body.message ?? body.error ?? `HTTP ${status}`);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({ error: 'unknown' }))) as ApiError;
    throw new ApiRequestError(res.status, body);
  }
  return res.json() as Promise<T>;
}

const post = <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) });

export const api = {
  createSession: (body: { zip: string } | { lat: number; lng: number }) => post<SessionDto>(`/api/session${debugQuery}`, body),
  getSession: (id: string) => request<SessionDto>(`/api/session/${id}${debugQuery}`),
  answer: (id: string, answer: AnswerDto) => post<SessionDto>(`/api/session/${id}/answer${debugQuery}`, answer),
  suggest: (id: string, nodeId: string, text: string) => post<{ ok: true }>(`/api/session/${id}/suggest`, { nodeId, text }),
  recommend: (id: string, force = false) => post<RecommendResponse>(`/api/session/${id}/recommend${debugQuery}`, { force }),
  feedback: (id: string, reason: FeedbackReason) => post<RecommendResponse>(`/api/session/${id}/feedback${debugQuery}`, { reason }),
};
