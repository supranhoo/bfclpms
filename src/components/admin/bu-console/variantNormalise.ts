/**
 * ADR-315 — Variance normaliser for the Performance Console.
 *
 * A console "variant" is not a different KPI: the variant key is derived from
 * four legacy variant-key fields — description, formula, scoring logic and target
 * (`public.bu_console_variant_key`). When those drift (fields swapped, wording
 * differences, empty values) the same metric splits into several variants.
 *
 * This module is pure: it groups the variants, picks a canonical definition and
 * builds one change set per non-canonical variant. Weightage is deliberately
 * NOT part of any change set — it is a legitimate per-employee number and is
 * not part of the variant key (POLICY §CONSOLE-VARIANT-NORMALISE).
 */

/**
 * ADR-327 — shared definition and employee scoring are separate concepts.
 * Only description and measurement formula are shared wording. Scoring logic,
 * target, bands and weightage belong to the employee scoring profile and must
 * never be emitted by this normaliser.
 */
export const WORDING_FIELDS = [
  'kpi_description', 'kpi_formula',
] as const;

/** Fields the shared-definition normaliser is allowed to write. */
export const VARIANT_FIELDS = [...WORDING_FIELDS] as const;

export type VariantField = (typeof VARIANT_FIELDS)[number];

export interface VariantLike {
  variant_key: string;
  description: string | null;
  formula: string | null;
  scoring_logic: string | null;
  target_value: number | null;
  uom?: string | null;
  employee_count?: number | null;
  kpi_rows?: number | null;
}

/** The four values that define a variant, in the canonical text form. */
export interface CanonicalDefinition {
  description: string;
  formula: string;
  scoring_logic: string;
  target_value: string;
}

/** Whitespace-insensitive comparison form — mirrors `normalize_kpi_text`. */
export const normText = (v: unknown): string =>
  v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim().toLowerCase();

const asText = (v: unknown): string =>
  v === null || v === undefined ? '' : String(v).trim();

export function definitionOf(v: VariantLike): CanonicalDefinition {
  return {
    description: asText(v.description),
    formula: asText(v.formula),
    scoring_logic: asText(v.scoring_logic),
    target_value: v.target_value === null || v.target_value === undefined ? '' : String(v.target_value),
  };
}

/**
 * Default canonical variant: the one covering the most employees, then the most
 * rows, then the most complete definition. Deterministic for equal candidates.
 */
export function pickCanonicalVariant(variants: VariantLike[]): VariantLike | null {
  if (!variants.length) return null;
  const filled = (v: VariantLike) =>
    [v.description, v.formula, v.scoring_logic].filter(x => asText(x).length > 0).length;
  return [...variants].sort((a, b) =>
    Number(b.employee_count ?? 0) - Number(a.employee_count ?? 0)
    || Number(b.kpi_rows ?? 0) - Number(a.kpi_rows ?? 0)
    || filled(b) - filled(a)
    || a.variant_key.localeCompare(b.variant_key),
  )[0];
}

/** True when the variant already matches the canonical definition. */
export function matchesDefinition(v: VariantLike, def: CanonicalDefinition): boolean {
  const d = definitionOf(v);
  return normText(d.description) === normText(def.description)
    && normText(d.formula) === normText(def.formula);
}

/**
 * Change set for one variant — only fields whose value actually differs.
 * Scoring fields are never emitted, whatever exists on the canonical variant.
 */
export function changeSetFor(
  v: VariantLike,
  def: CanonicalDefinition,
): Record<string, string | null> {
  const current = definitionOf(v);
  const out: Record<string, string | null> = {};
  const put = (field: VariantField, next: string, now: string) => {
    if (normText(next) !== normText(now)) out[field] = next.length ? next : null;
  };
  put('kpi_description', def.description, current.description);
  put('kpi_formula', def.formula, current.formula);
  return out;
}

/* ------------------------------------------------------------------ */
/* Variance classification (ADR-325)                                   */
/* ------------------------------------------------------------------ */

export interface VarianceClassification {
  /** Distinct shared-definition groups (description + formula). */
  wordingGroups: number;
  /** Distinct target values across the variants. */
  targetGroups: number;
  /** Every distinct target, in the order first seen. */
  targets: string[];
  /** Distinct employee scoring signatures visible in the tree payload. */
  scoringGroups: number;
  /** True when only employee scoring differs — deliberate, not wording drift. */
  targetsOnly: boolean;
  /** True when there is text drift worth standardising. */
  hasWordingDrift: boolean;
}

export function classifyVariance(variants: VariantLike[]): VarianceClassification {
  const wording = new Set<string>();
  const scoring = new Set<string>();
  const targets: string[] = [];
  for (const v of variants) {
    const d = definitionOf(v);
    wording.add([d.description, d.formula].map(normText).join('|'));
    scoring.add([d.target_value, d.scoring_logic].map(normText).join('|'));
    const t = asText(d.target_value);
    if (!targets.includes(t)) targets.push(t);
  }
  const wordingGroups = Math.max(wording.size, variants.length ? 1 : 0);
  const targetGroups = Math.max(targets.length, variants.length ? 1 : 0);
  const scoringGroups = Math.max(scoring.size, variants.length ? 1 : 0);
  return {
    wordingGroups,
    targetGroups,
    scoringGroups,
    targets,
    targetsOnly: wordingGroups === 1 && scoringGroups > 1,
    hasWordingDrift: wordingGroups > 1,
  };
}

export interface NormaliseStep {
  variantKey: string;
  employeeCount: number;
  changes: Record<string, string | null>;
}

export interface NormalisePlan {
  canonicalKey: string;
  definition: CanonicalDefinition;
  /** Variants that need writing — the canonical one and no-ops are excluded. */
  steps: NormaliseStep[];
  /** Variants already identical to the canonical definition. */
  alreadyAligned: string[];
  employeesAffected: number;
  /** Variant count once every step commits (1 when the plan is complete). */
  predictedVariantCount: number;
}

/**
 * Resolve the plan. `definition` may be an edited version of the canonical
 * variant — the canonical rows are then rewritten too.
 */
export function buildNormalisePlan(
  variants: VariantLike[],
  canonicalKey: string,
  definition?: CanonicalDefinition,
): NormalisePlan {
  const canonical = variants.find(v => v.variant_key === canonicalKey) ?? pickCanonicalVariant(variants);
  const def = definition ?? (canonical ? definitionOf(canonical) : {
    description: '', formula: '', scoring_logic: '', target_value: '',
  });

  const steps: NormaliseStep[] = [];
  const alreadyAligned: string[] = [];
  for (const v of variants) {
    const changes = changeSetFor(v, def);
    if (Object.keys(changes).length === 0) { alreadyAligned.push(v.variant_key); continue; }
    steps.push({
      variantKey: v.variant_key,
      employeeCount: Number(v.employee_count ?? 0),
      changes,
    });
  }

  return {
    canonicalKey: canonical?.variant_key ?? canonicalKey,
    definition: def,
    steps,
    alreadyAligned,
    employeesAffected: steps.reduce((n, s) => n + s.employeeCount, 0),
    // Shared wording alignment leaves every distinct employee scoring profile.
    predictedVariantCount: Math.max(1, classifyVariance(variants).scoringGroups),
  };
}

export const planIsNoOp = (plan: NormalisePlan): boolean => plan.steps.length === 0;

/* ------------------------------------------------------------------ */
/* Result aggregation                                                  */
/* ------------------------------------------------------------------ */

export interface NormaliseRunEntry {
  variantKey: string;
  target: { month: string; year: number };
  result: { will_write?: number | null; will_skip?: number | null; updated?: number | null } | null;
  error?: string | null;
}

export interface NormaliseTotals {
  willWrite: number;
  willSkip: number;
  updated: number;
  failed: number;
}

export function aggregateNormalise(entries: NormaliseRunEntry[]): NormaliseTotals {
  let willWrite = 0, willSkip = 0, updated = 0, failed = 0;
  for (const e of entries) {
    if (e.error) { failed += 1; continue; }
    willWrite += Number(e.result?.will_write ?? 0);
    willSkip += Number(e.result?.will_skip ?? 0);
    updated += Number(e.result?.updated ?? 0);
  }
  return { willWrite, willSkip, updated, failed };
}
