/**
 * ADR-218e — pure builders for the read-only "submitted review form" viewer.
 *
 * Turns an instance + its responses + the resolved template into ordered,
 * display-ready stage blocks. No I/O, no React — covered by unit tests.
 */
import { STAGE_ORDER, STAGE_LABEL } from '@/lib/annualReview/constants';
import type {
  AnnualReviewTemplate,
  AnnualReviewerRole,
  AnnualReviewResponse,
} from '@/types/annualReview';

export interface CriterionAnswer {
  id: string;
  name: string;
  score: number | null;
  comment: string | null;
}

export interface StageBlock {
  role: AnnualReviewerRole;
  label: string;
  reviewerName: string | null;
  submittedAt: string | null;
  submitted: boolean;
  weightedScore: number | null;
  notes: string | null;
  criteria: CriterionAnswer[];
}

export interface ReviewFormResponseRow
  extends Pick<AnnualReviewResponse,
    'reviewer_role' | 'criteria_scores' | 'qualitative_responses' | 'weighted_score' | 'submitted_at' | 'notes'> {
  reviewer_name?: string | null;
}

/** Criterion id → authored name, falling back to the raw id. */
export function criterionNameMap(
  template: Pick<AnnualReviewTemplate, 'sections'> | null | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of template?.sections?.criteria ?? []) out[c.id] = c.name;
  return out;
}

/**
 * Ordered stage blocks. Only stages that are enabled on the instance (or that
 * actually have a response row) are returned, in canonical order.
 */
export function buildStageBlocks(args: {
  template: Pick<AnnualReviewTemplate, 'sections'> | null | undefined;
  responses: ReviewFormResponseRow[];
  enabledStages?: AnnualReviewerRole[] | null;
}): StageBlock[] {
  const names = criterionNameMap(args.template);
  const criteriaIds = (args.template?.sections?.criteria ?? []).map((c) => c.id);
  const byRole = new Map<AnnualReviewerRole, ReviewFormResponseRow>();
  for (const r of args.responses ?? []) byRole.set(r.reviewer_role, r);

  const enabled = new Set<AnnualReviewerRole>(args.enabledStages ?? []);

  return STAGE_ORDER
    .filter((role) => byRole.has(role) || enabled.has(role))
    .map((role) => {
      const r = byRole.get(role);
      const scores = (r?.criteria_scores ?? {}) as Record<string, number>;
      const comments = (r?.qualitative_responses ?? {}) as Record<string, string>;
      const ids = Array.from(new Set([
        ...criteriaIds,
        ...Object.keys(scores),
        ...Object.keys(comments),
      ]));
      const criteria: CriterionAnswer[] = ids.map((id) => {
        const raw = scores[id];
        const text = comments[id];
        return {
          id,
          name: names[id] ?? id,
          score: typeof raw === 'number' && Number.isFinite(raw) ? raw : null,
          comment: typeof text === 'string' && text.trim() ? text.trim() : null,
        };
      });
      return {
        role,
        label: STAGE_LABEL[role],
        reviewerName: r?.reviewer_name ?? null,
        submittedAt: r?.submitted_at ?? null,
        submitted: !!r?.submitted_at,
        weightedScore: r?.weighted_score ?? null,
        notes: r?.notes && r.notes.trim() ? r.notes.trim() : null,
        criteria,
      };
    });
}

export interface SystemScoreRow {
  id: string;
  name: string;
  source?: string;
  raw: number | null;
  points: number | null;
  weight: number;
}

/** System slots with their raw keyed-in value and resolved points. */
export function buildSystemScoreRows(
  template: Pick<AnnualReviewTemplate, 'sections'> | null | undefined,
  systemScores: Record<string, number> | null | undefined,
  systemScoresRaw: Record<string, number> | null | undefined,
): SystemScoreRow[] {
  return (template?.sections?.system_scores ?? []).map((s) => {
    const slot = s as { id: string; label?: string; name?: string; weight?: number; source?: string };
    const pts = systemScores?.[slot.id];
    const raw = systemScoresRaw?.[slot.id];
    return {
      id: slot.id,
      name: slot.label ?? slot.name ?? 'System score',
      source: slot.source,
      raw: typeof raw === 'number' && Number.isFinite(raw) ? raw : null,
      points: typeof pts === 'number' && Number.isFinite(pts) ? pts : null,
      weight: Number(slot.weight) || 0,
    };
  });
}