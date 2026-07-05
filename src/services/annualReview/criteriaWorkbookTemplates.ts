import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import type { ParsedCriteriaSheet } from '@/lib/annualReview/criteriaWorkbook';
import { parseBandsBlock } from '@/lib/annualReview/bfclFormsWorkbook';
import { bandsToBilingualOptions, optionsToBands } from '@/lib/annualReview/criteriaBands';

/**
 * One sheet in the uploaded criteria workbook → one assignable
 * `annual_review_templates` row (plus assignment rules routing the chosen
 * departments/sub-units to it). Idempotent — reruns update rows in place via
 * `sections.sheet_key`.
 */

export interface SheetKey {
  source: 'criteria_workbook';
  sheet_name: string;
  cycle_id: string;
}

export interface WorkbookTemplateTarget {
  department_ids: string[];   // empty = wildcard (all)
  sub_unit_ids: string[];     // empty = wildcard
  archetype?: string | null;
  grade_bucket?: string | null;
  grade_code?: string | null;
}

export interface WorkbookTemplateMeta {
  template_name: string;
  cycle_id: string;
  sheet_name: string;
  target: WorkbookTemplateTarget;
  create_rule: boolean;
}

function uid(p: string) {
  return `${p}_${Math.random().toString(36).slice(2, 9)}`;
}

function canonicalWorkflowSections(systemWeightTotal: number) {
  const criteriaPool = Math.max(0, 100 - systemWeightTotal);
  return {
    enabled_stages: ['self', 'dept_head', 'bu_head'],
    stage_weights: {
      ...(systemWeightTotal > 0 ? { system: systemWeightTotal } : {}),
      ...(criteriaPool > 0 ? { self: criteriaPool * 0.3, dept_head: criteriaPool * 0.7 } : {}),
    },
  };
}

/** Build the `sections` JSON payload for a workbook sheet. */
export function buildTemplateSectionsFromSheet(
  sheet: ParsedCriteriaSheet,
  meta: { sheet_key: SheetKey },
): Record<string, unknown> {
  const criteria = sheet.rows
    .filter((r) => r.label_en)
    .map((r) => {
      const bands = parseBandsBlock(r.rating_desc ?? '');
      const max = Math.max(5, bands.reduce((m, b) => Math.max(m, b.score), 0));
      const bandsJson = optionsToBands(bands);
      return {
        id: uid('crit'),
        name: r.label_en,
        description: '',
        weight: Number(r.weight_pct) || 0,
        reviewer_stages: ['self', 'dept_head'],
        enable_remarks: true,
        enable_evidence: false,
        options: bandsToBilingualOptions(bandsJson, max),
        // Preserve workbook payload for exports / bilingual rendering.
        label_en: r.label_en,
        label_hi: r.label_hi,
        max_score: max,
        scoring_bands: bandsJson,
        weight_pct: Number(r.weight_pct) || 0,
      };
    });
  const system_scores = (sheet.systemRows ?? [])
    .filter((r) => r.label_en)
    .map((r) => ({
      id: uid('sys'),
      name: r.label_en,
      description: r.description || undefined,
      weight: Number(r.weight_pct) || 0,
      source: 'workbook',
      label_en: r.label_en,
      label_hi: r.label_hi,
      weight_pct: Number(r.weight_pct) || 0,
    }));
  const systemWeightTotal = system_scores.reduce((sum, r) => sum + (Number(r.weight) || 0), 0);
  const workflow = canonicalWorkflowSections(systemWeightTotal);

  return {
    display_mode: 'bilingual',
    criteria,
    system_scores,
    enabled_stages: workflow.enabled_stages,
    stage_weights: workflow.stage_weights,
    sheet_key: meta.sheet_key,
  };
}

/** Upsert a workbook-sourced template keyed on `sections.sheet_key`. */
export async function upsertWorkbookTemplate(
  meta: WorkbookTemplateMeta,
  sheet: ParsedCriteriaSheet,
): Promise<{ id: string; created: boolean }> {
  const sheet_key: SheetKey = {
    source: 'criteria_workbook',
    sheet_name: meta.sheet_name,
    cycle_id: meta.cycle_id,
  };
  // Look for an existing template with the same sheet_key.
  const { data: existing, error: findErr } = await supabase
    .from('annual_review_templates')
    .select('id, sections')
    .eq('sections->sheet_key->>sheet_name', meta.sheet_name)
    .eq('sections->sheet_key->>cycle_id', meta.cycle_id)
    .maybeSingle();
  if (findErr && findErr.code !== 'PGRST116') throw findErr;

  const sections = buildTemplateSectionsFromSheet(sheet, { sheet_key });

  if (existing?.id) {
    const { error } = await supabase
      .from('annual_review_templates')
      .update({ name: meta.template_name, sections: sections as unknown as Json })
      .eq('id', existing.id);
    if (error) throw error;
    return { id: existing.id, created: false };
  }

  const { data, error } = await supabase
    .from('annual_review_templates')
    .insert({
      name: meta.template_name,
      description: `Imported from workbook sheet "${meta.sheet_name}".`,
      is_active: true,
      sections: sections as unknown as Json,
    })
    .select('id')
    .single();
  if (error) throw error;
  return { id: data.id, created: true };
}

/**
 * Ensure one assignment rule exists per (template × cycle) with the given
 * department/sub-unit filters. Idempotent: an existing rule for the same
 * template+cycle is updated in place; otherwise inserted.
 */
export async function upsertWorkbookAssignmentRule(
  templateId: string,
  meta: WorkbookTemplateMeta,
): Promise<{ id: string; created: boolean }> {
  const filters = {
    roles: [],
    grades: meta.target.grade_code ? [meta.target.grade_code] : [],
    levels: [],
    bu_ids: [],
    department_ids: meta.target.department_ids ?? [],
    sub_unit_ids: meta.target.sub_unit_ids ?? [],
    archetype_code: meta.target.archetype || null,
    grade_bucket: meta.target.grade_bucket || null,
  } as unknown as Json;

  const { data: existing, error: findErr } = await supabase
    .from('annual_review_assignment_rules')
    .select('id')
    .eq('template_id', templateId)
    .eq('cycle_id', meta.cycle_id)
    .maybeSingle();
  if (findErr && findErr.code !== 'PGRST116') throw findErr;

  if (existing?.id) {
    const { error } = await supabase
      .from('annual_review_assignment_rules')
      .update({
        name: `Workbook · ${meta.sheet_name}`,
        filters,
        archetype_code: meta.target.archetype || null,
        grade_bucket: meta.target.grade_bucket || null,
        requires_kra_in_ay: meta.target.archetype === 'A',
        is_active: true,
      })
      .eq('id', existing.id);
    if (error) throw error;
    return { id: existing.id, created: false };
  }

  const { data, error } = await supabase
    .from('annual_review_assignment_rules')
    .insert({
      template_id: templateId,
      cycle_id: meta.cycle_id,
      name: `Workbook · ${meta.sheet_name}`,
      priority: 5,
      filters,
      archetype_code: meta.target.archetype || null,
      grade_bucket: meta.target.grade_bucket || null,
      requires_kra_in_ay: meta.target.archetype === 'A',
      is_active: true,
    })
    .select('id')
    .single();
  if (error) throw error;
  return { id: data.id, created: true };
}