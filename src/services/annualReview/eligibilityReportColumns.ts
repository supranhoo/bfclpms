import { supabase } from '@/integrations/supabase/client';
import type { EligibilityCriterion } from '@/types/annualReview';
import { evaluate } from '@/lib/annualReview/eligibility';
import { formatExpected, formatActual } from '@/lib/annualReview/eligibilityFormat';

/**
 * ADR-181 / POLICY §RPT-ELIGIBILITY-COLUMNS
 *
 * The Annual Review comprehensive export renders one column per eligibility
 * question authored on the templates used by the cycle. Each cell carries the
 * entered value, the expected condition and the pass/fail verdict, using the
 * same evaluator the app uses so the report can never disagree with the UI.
 */

export type EligibilityMaps = Record<string, EligibilityCriterion[]>;

export interface EligibilityColumn {
  /** Excel header — the authored question name. */
  header: string;
  /** Normalised key used to de-duplicate the same question across templates. */
  key: string;
}

export function normaliseQuestion(name: string): string {
  return (name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Batched fetch of eligibility criteria per template. Fails soft (empty maps). */
export async function fetchTemplateEligibilityMaps(
  templateIds: Array<string | null | undefined>,
): Promise<EligibilityMaps> {
  const ids = Array.from(new Set(templateIds.filter((id): id is string => !!id)));
  const out: EligibilityMaps = {};
  if (ids.length === 0) return out;

  const { data, error } = await (supabase as any)
    .from('annual_review_templates')
    .select('id, sections')
    .in('id', ids);
  if (error || !data) return out;

  for (const row of data as Array<{ id: string; sections: any }>) {
    const list = (row.sections?.eligibility_criteria ?? []) as EligibilityCriterion[];
    out[row.id] = Array.isArray(list) ? list.filter((c) => !!c?.id && !!c?.name) : [];
  }
  return out;
}

/**
 * Union of eligibility questions across every template present on the loaded
 * rows, de-duplicated by normalised question name, in first-seen order.
 */
export function buildEligibilityColumnSet(
  templateIds: Array<string | null | undefined>,
  maps: EligibilityMaps,
): EligibilityColumn[] {
  const seen = new Set<string>();
  const cols: EligibilityColumn[] = [];
  for (const tid of templateIds) {
    if (!tid) continue;
    for (const c of maps[tid] ?? []) {
      const key = normaliseQuestion(c.name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      cols.push({ header: c.name.trim(), key });
    }
  }
  return cols;
}

export interface EligibilityVerdict {
  /** `3 (At most 5) — Pass` */
  cell: string;
  provided: boolean;
  passed: boolean;
}

/** Render one eligibility answer with its expected condition and verdict. */
export function formatEligibilityCell(
  criterion: EligibilityCriterion,
  value: unknown,
): EligibilityVerdict {
  const provided = value !== null && value !== undefined && value !== '';
  const expected = formatExpected(criterion);
  const actual = formatActual(value, criterion.type);
  if (!provided) {
    return { cell: `— (${expected}) — Not provided`, provided: false, passed: false };
  }
  const coerced =
    criterion.type === 'number' ? Number(value)
    : criterion.type === 'boolean'
      ? (value === true || value === 'true' || value === 1 || value === '1')
      : String(value);
  const passed = evaluate(criterion.operator, coerced, criterion.expected_value);
  return { cell: `${actual} (${expected}) — ${passed ? 'Pass' : 'Fail'}`, provided: true, passed };
}

export interface EligibilityRowResult {
  /** header → cell text (only for questions on this employee's template). */
  cells: Record<string, string>;
  /** `Pass`, `Fail (Absent Days)`, or `—` when the template has no criteria. */
  summary: string;
}

/** Build the per-question cells + summary for a single employee row. */
export function buildEligibilityRow(
  templateId: string | null | undefined,
  inputs: Record<string, unknown> | null | undefined,
  maps: EligibilityMaps,
): EligibilityRowResult {
  const criteria = (templateId ? maps[templateId] : undefined) ?? [];
  if (criteria.length === 0) return { cells: {}, summary: '—' };
  const src = inputs ?? {};
  const cells: Record<string, string> = {};
  const failed: string[] = [];
  for (const c of criteria) {
    const raw = src[c.id] ?? src[c.name];
    const v = formatEligibilityCell(c, raw);
    cells[c.name.trim()] = v.cell;
    if (!v.passed) failed.push(c.name.trim());
  }
  return { cells, summary: failed.length === 0 ? 'Pass' : `Fail (${failed.join(', ')})` };
}