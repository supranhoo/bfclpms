/**
 * Safety Audit Checklists — SSOT
 * ------------------------------
 * Mirrors:
 *   public.safety_audit_run_status enum
 *   public.safety_audit_answer enum
 *   public.submit_audit_run RPC
 *   public.mark_audit_reviewed RPC
 *
 * UI MUST import labels and helpers from here — never hardcode.
 */

export const SAFETY_AUDIT_RUN_STATUSES = ['draft', 'submitted', 'reviewed'] as const;
export type SafetyAuditRunStatus = (typeof SAFETY_AUDIT_RUN_STATUSES)[number];

export const SAFETY_AUDIT_RUN_STATUS_LABEL: Record<SafetyAuditRunStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  reviewed: 'Reviewed',
};

export const SAFETY_AUDIT_RUN_STATUS_TONE: Record<
  SafetyAuditRunStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  draft: 'outline',
  submitted: 'secondary',
  reviewed: 'default',
};

export const SAFETY_AUDIT_ANSWERS = ['yes', 'no', 'na'] as const;
export type SafetyAuditAnswer = (typeof SAFETY_AUDIT_ANSWERS)[number];

export const SAFETY_AUDIT_ANSWER_LABEL: Record<SafetyAuditAnswer, string> = {
  yes: 'Yes',
  no: 'No',
  na: 'N/A',
};

/* ─────────────────────────────────────────────── pure helpers ─── */

export interface ScoringItem {
  weight: number;
  is_critical: boolean;
  evidence_required?: boolean;
}

export interface ScoringResponse {
  answer: SafetyAuditAnswer;
  evidence_path?: string | null;
}

export interface ScoringPair {
  item: ScoringItem;
  response: ScoringResponse;
}

/**
 * Weighted score 0-100 over non-NA items.
 * yes = full weight; no = 0. NA items are excluded from both numerator and denominator.
 * Returns 0 when nothing scored.
 */
export function computeAuditScore(pairs: ScoringPair[]): number {
  let totalW = 0;
  let totalP = 0;
  for (const { item, response } of pairs) {
    if (response.answer === 'na') continue;
    totalW += item.weight;
    if (response.answer === 'yes') totalP += item.weight;
  }
  if (totalW === 0) return 0;
  return Math.round((totalP / totalW) * 10000) / 100;
}

/** Counts critical NOs that will auto-create an incident on submit. */
export function countCriticalFailures(pairs: ScoringPair[]): number {
  let n = 0;
  for (const { item, response } of pairs) {
    if (item.is_critical && response.answer === 'no') n += 1;
  }
  return n;
}

/**
 * Pre-submit validator. Returns null when valid, else a user-readable message.
 * Mirrors the server-side check inside submit_audit_run.
 */
export function validateAuditSubmission(pairs: ScoringPair[]): string | null {
  if (pairs.length === 0) return 'Add responses for all items before submitting.';
  for (const { item, response } of pairs) {
    if (
      response.answer === 'no' &&
      item.evidence_required &&
      (!response.evidence_path || !response.evidence_path.trim())
    ) {
      return 'Evidence is required for every critical "No" answer.';
    }
  }
  return null;
}

/** Compliance band used by the scoreboard. */
export type ComplianceBand = 'excellent' | 'good' | 'fair' | 'poor';

export function complianceBand(score: number | null): ComplianceBand {
  if (score === null || Number.isNaN(score)) return 'poor';
  if (score >= 90) return 'excellent';
  if (score >= 75) return 'good';
  if (score >= 60) return 'fair';
  return 'poor';
}

export const COMPLIANCE_BAND_LABEL: Record<ComplianceBand, string> = {
  excellent: 'Excellent (≥90)',
  good: 'Good (≥75)',
  fair: 'Fair (≥60)',
  poor: 'Poor (<60)',
};

export const COMPLIANCE_BAND_TONE: Record<
  ComplianceBand,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  excellent: 'default',
  good: 'secondary',
  fair: 'outline',
  poor: 'destructive',
};

export const SAFETY_AUDIT_CATEGORIES = [
  'general',
  'housekeeping',
  'ppe',
  'electrical',
  'fire_safety',
  'machine_guarding',
  'lifting',
  'environment',
  'workplace',
] as const;

export type SafetyAuditCategory = (typeof SAFETY_AUDIT_CATEGORIES)[number];

export const SAFETY_AUDIT_CATEGORY_LABEL: Record<SafetyAuditCategory, string> = {
  general: 'General',
  housekeeping: 'Housekeeping',
  ppe: 'PPE',
  electrical: 'Electrical',
  fire_safety: 'Fire Safety',
  machine_guarding: 'Machine Guarding',
  lifting: 'Lifting',
  environment: 'Environment',
  workplace: 'Workplace',
};