import { supabase } from '@/integrations/supabase/client';
import type { TemplateCriterion, TemplateSystemScore } from '@/types/annualReview';

/**
 * ADR-180 / POLICY §RPT-SCORE-MAP-READABLE
 *
 * The Annual Review comprehensive export used to dump raw JSON keyed by
 * internal criterion ids (`crit_1kh5259`). This module resolves those ids to
 * the authored names on the employee's template and renders a single readable
 * cell such as `Safety: 4 | Quality: 4 | Attendance: 5`.
 *
 * Pure formatter (`formatScoreMap`) + a batched fetch of template label maps.
 */

/** Ordered id → label pairs; order follows the template's authored order. */
export interface LabelMap {
  order: string[];
  labels: Record<string, string>;
}

export interface TemplateLabelMaps {
  criteria: Record<string, LabelMap>;
  system: Record<string, LabelMap>;
  /**
   * ADR-188 — true when the template's scoring is KRA-driven (at least one
   * `system_scores` slot has `source === 'carry_kra'`). Resolved here so the
   * export does not need a second templates query.
   */
  isKra: Record<string, boolean>;
}

const EMPTY_LABEL_MAP: LabelMap = { order: [], labels: {} };

function buildLabelMap(items: Array<{ id?: string; name?: string }> | undefined): LabelMap {
  const order: string[] = [];
  const labels: Record<string, string> = {};
  for (const it of items ?? []) {
    if (!it?.id) continue;
    order.push(it.id);
    labels[it.id] = (it.name ?? '').trim() || it.id;
  }
  return { order, labels };
}

function formatNumber(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v ?? '');
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
}

/**
 * Render a `{ id: score }` map as `Label: score | Label: score`.
 * Keys unknown to the template are appended verbatim so a template swap can
 * never silently drop persisted scores.
 */
export function formatScoreMap(
  scores: Record<string, unknown> | null | undefined,
  map: LabelMap | undefined | null,
): string {
  if (!scores) return '';
  const keys = Object.keys(scores);
  if (keys.length === 0) return '';
  const lm = map ?? EMPTY_LABEL_MAP;
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const id of lm.order) {
    if (!(id in scores)) continue;
    seen.add(id);
    parts.push(`${lm.labels[id] ?? id}: ${formatNumber(scores[id])}`);
  }
  for (const id of keys) {
    if (seen.has(id)) continue;
    parts.push(`${lm.labels[id] ?? id}: ${formatNumber(scores[id])}`);
  }
  return parts.join(' | ');
}

/**
 * Batched fetch of criterion / system-score label maps for the given templates.
 * Fails soft: on error, returns empty maps so the export still renders raw ids.
 */
export async function fetchTemplateLabelMaps(templateIds: Array<string | null | undefined>): Promise<TemplateLabelMaps> {
  const ids = Array.from(new Set(templateIds.filter((id): id is string => !!id)));
  const out: TemplateLabelMaps = { criteria: {}, system: {}, isKra: {} };
  if (ids.length === 0) return out;

  const { data, error } = await (supabase as any)
    .from('annual_review_templates')
    .select('id, sections')
    .in('id', ids);
  if (error || !data) return out;

  for (const row of data as Array<{ id: string; sections: any }>) {
    const sections = row.sections ?? {};
    const systemScores = (sections.system_scores ?? []) as TemplateSystemScore[];
    out.criteria[row.id] = buildLabelMap(sections.criteria as TemplateCriterion[] | undefined);
    out.system[row.id] = buildLabelMap(systemScores);
    out.isKra[row.id] = systemScores.some((s) => s?.source === 'carry_kra');
  }
  return out;
}
