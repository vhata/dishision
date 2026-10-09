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

export type { FeedbackReason } from '../core/feedback';

export interface MenuItemDto {
  id: string;
  name: string;
  description?: string;
  priceCents?: number;
  menuless?: boolean;
  archetypeId?: string;
  cuisine?: string;
}

export interface OrderLinks {
  website?: string;
  maps?: string;
  doordash: string;
  ubereats: string;
}

export interface RecommendationDto {
  kind: 'single' | 'pair';
  restaurant: import('../core/types').RestaurantSummary;
  items: MenuItemDto[];
  score: number;
  explanation: string;
  menuless: boolean;
  links: OrderLinks;
  trace?: import('../core/scoring').ScoreTrace;
}

export interface RecommendResponse {
  recommendationId: string | null;
  primary: RecommendationDto | null;
  runnerUp: RecommendationDto | null;
  message?: string;
  debug?: {
    candidateRestaurants: number;
    candidateItems: number;
    rejectedItemIds: string[];
    ranked: { label: string; restaurant: string; score: number }[];
  };
}

export interface FeedbackRequest {
  reason: import('../core/feedback').FeedbackReason;
}
