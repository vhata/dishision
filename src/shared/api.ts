import type { NodeKind } from '../core/kb/schema';
import type { DinnerPreferences } from '../core/preferences';
import type { AnswerInput } from '../core/questions';

export interface QuestionDto {
  nodeId: string;
  kind: NodeKind;
  prompt: string;
  help?: string;
  options: { id: string; label: string }[];
  stops?: string[];
  allowMissingOption: boolean;
  round: 1 | 2;
}

export type AnswerDto = AnswerInput;

export type SessionStatus = 'asking' | 'ready' | 'recommended';

export interface SessionDebug {
  prefs: DinnerPreferences;
  asked: string[];
  round2Asked: number;
  rejectedItemIds: string[];
  lastOtherParse?: { source: 'llm' | 'keywords'; patch: unknown };
}

export interface SessionDto {
  id: string;
  zipLabel: string;
  status: SessionStatus;
  question: QuestionDto | null;
  debug?: SessionDebug;
}

export interface ApiError {
  error: string;
  message?: string;
  issues?: unknown;
}
