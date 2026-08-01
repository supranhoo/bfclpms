/**
 * ADR-226 Phase 2 — Legacy recommendation classification (client SSOT).
 *
 * Mirrors the PL/pgSQL functions `public.ar_parse_recommendation_amount` and
 * `public.ar_classify_recommendation_text`. The database stays authoritative for
 * the actual backfill; this copy lets the UI preview a classification and makes
 * the rules unit-testable without a round trip.
 *
 * POLICY §AR-RECOMMENDATION-TRACKING.7 — keyword patterns are master data in
 * `annual_review_recommendation_keywords`. Nothing here hardcodes a rule; the
 * caller passes the rules loaded from the database.
 */

export type RecommendationAmountKind = 'absolute' | 'percent';

export interface RecommendationKeywordRule {
  pattern: string;
  type_key: string;
  weight: number;
  is_active: boolean;
}

export interface ParsedAmount {
  kind: RecommendationAmountKind | null;
  value: number | null;
}

export interface ClassificationResult {
  /** Matched type keys, highest confidence first. */
  typeKeys: string[];
  /** Highest aggregate weight across matched types. */
  bestScore: number;
  /** `submitted` when confident, otherwise `needs_classification`. */
  status: 'submitted' | 'needs_classification';
  amount: ParsedAmount;
}

/** Minimum aggregate weight for a match to be treated as confident. */
export const CONFIDENT_SCORE_THRESHOLD = 3;

/**
 * Extracts a monetary ask from free prose.
 * Percent wins over an absolute amount when both appear, matching the SQL.
 */
export function parseRecommendationAmount(text: string | null | undefined): ParsedAmount {
  const txt = (text ?? '').toLowerCase();
  if (!txt.trim()) return { kind: null, value: null };

  const pct = txt.match(/([0-9]{1,3}(?:\.[0-9]{1,2})?)\s*(?:%|percent|pct)/);
  if (pct) {
    const v = Number(pct[1]);
    if (Number.isFinite(v) && v >= 0 && v <= 100) return { kind: 'percent', value: v };
  }

  const abs =
    txt.match(/(?:rs\.?|inr|₹)\s*([0-9][0-9,]{2,})/) ?? txt.match(/\(\s*([0-9][0-9,]{2,})\s*\)/);
  if (abs) {
    const v = Number(abs[1].replace(/,/g, ''));
    if (Number.isFinite(v) && v > 0) return { kind: 'absolute', value: v };
  }

  return { kind: null, value: null };
}

/**
 * Scores prose against the configured keyword rules.
 * Unmatched prose falls back to the `none` type and always requires a human.
 */
export function classifyRecommendationText(
  text: string | null | undefined,
  rules: RecommendationKeywordRule[],
): ClassificationResult {
  const txt = (text ?? '').toLowerCase();
  const amount = parseRecommendationAmount(text);

  if (!txt.trim()) {
    return { typeKeys: ['none'], bestScore: 0, status: 'needs_classification', amount };
  }

  const scores = new Map<string, number>();
  for (const rule of rules) {
    if (!rule.is_active) continue;
    let re: RegExp;
    try {
      re = new RegExp(rule.pattern, 'i');
    } catch {
      continue; // an invalid admin-entered pattern must never break the preview
    }
    if (re.test(txt)) {
      scores.set(rule.type_key, (scores.get(rule.type_key) ?? 0) + rule.weight);
    }
  }

  if (scores.size === 0) {
    return { typeKeys: ['none'], bestScore: 0, status: 'needs_classification', amount };
  }

  const sorted = [...scores.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const bestScore = sorted[0][1];

  return {
    typeKeys: sorted.map(([k]) => k),
    bestScore,
    status: bestScore >= CONFIDENT_SCORE_THRESHOLD ? 'submitted' : 'needs_classification',
    amount,
  };
}