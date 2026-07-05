import { supabase } from '@/integrations/supabase/client';
import type { Database, Json } from '@/integrations/supabase/types';
import {
  listArchetypes, parseCriteria, parseStageWeights, parseStringArray,
  type ArchetypeRow, type StageKey,
} from './templateArchetypes';
import {
  listSystemKpis, listSystemKpiWeights, resolveWeight,
  parseScoringRules,
  type SystemKpiRow, type SystemKpiWeightRow,
} from './systemKpiLibrary';
import {
  listCriteriaLibrary, listCriteriaAssignments, resolveCriteria,
  validateResolvedWeights,
  type CriterionRow, type CriterionAssignmentRow, type ResolvedCriterion,
} from './criteriaLibrary';
import { bandsToBilingualOptions } from '@/lib/annualReview/criteriaBands';

export type TemplateRow = Database['public']['Tables']['annual_review_templates']['Row'];
export type ArchetypeCode = 'A' | 'B' | 'C' | 'D';
export type GradeBucket = 'M' | 'W' | 'T' | 'other';

/** Idempotency key stored under `sections.factory_key`. */
export interface FactoryKey {
  cycle_id: string;
  department_id: string | null;
  sub_unit_id: string | null;
  archetype_code: ArchetypeCode;
  grade_bucket: GradeBucket;
}

export interface FactoryRunInput {
  cycle: { id: string; name: string; review_year: number };
  departmentIds: string[];             // required, ≥1
  subUnitIds: (string | null)[];       // may contain [null] to mean "no sub-unit"
  archetypeCodes: ArchetypeCode[];     // ≥1
  gradeBuckets: GradeBucket[];         // ≥1
  overrideStageWeights?: Record<StageKey, number> | null;  // optional per-run override
}

export interface PlannedRow {
  key: FactoryKey;
  action: 'create' | 'update' | 'noop';
  templateName: string;
  departmentName: string;
  subUnitName: string | null;
  archetype: ArchetypeRow;
  systemWeightTotal: number;
  criteriaCount: number;
  criteriaSource: 'library' | 'archetype';
  criteriaWeightTotal: number;
  criteriaWeightOk: boolean;
  existingId: string | null;
  payload: {
    name: string;
    sections: Json;
    is_active: true;
  };
}

function matchFactoryKey(row: TemplateRow, key: Partial<FactoryKey>): boolean {
  const s = (row.sections ?? {}) as Record<string, unknown>;
  const fk = s.factory_key as Record<string, unknown> | undefined;
  if (!fk) return false;
  return (
    fk.cycle_id === key.cycle_id &&
    (fk.department_id ?? null) === (key.department_id ?? null) &&
    (fk.sub_unit_id ?? null) === (key.sub_unit_id ?? null) &&
    fk.archetype_code === key.archetype_code &&
    fk.grade_bucket === key.grade_bucket
  );
}

/** Fetch all factory-generated templates for a cycle. */
export async function listFactoryTemplates(cycleId: string): Promise<TemplateRow[]> {
  const { data, error } = await supabase
    .from('annual_review_templates')
    .select('*')
    .filter('sections->factory_key->>cycle_id', 'eq', cycleId);
  if (error) throw error;
  return data ?? [];
}

interface OrgLookup {
  departments: Record<string, string>;    // id → name
  subUnits: Record<string, string>;       // id → name
}

async function loadOrgLookup(deptIds: string[], subUnitIds: string[]): Promise<OrgLookup> {
  const [{ data: deps }, { data: subs }] = await Promise.all([
    supabase.from('departments').select('id, name').in('id', deptIds),
    subUnitIds.length
      ? supabase.from('business_unit_sub_units').select('id, label').in('id', subUnitIds)
      : Promise.resolve({ data: [] as { id: string; label: string }[] }),
  ]);
  const departments: Record<string, string> = {};
  (deps ?? []).forEach((d) => { departments[d.id] = d.name; });
  const subUnits: Record<string, string> = {};
  (subs ?? []).forEach((s) => { subUnits[s.id] = s.label; });
  return { departments, subUnits };
}

function buildSystemScoresSection(
  kpis: SystemKpiRow[],
  weights: SystemKpiWeightRow[],
  departmentId: string | null,
  subUnitId: string | null,
  gradeBucket: GradeBucket,
): { rows: Json[]; total: number } {
  const rows: Json[] = [];
  let total = 0;
  for (const k of kpis) {
    if (!k.is_active) continue;
    const w = resolveWeight(weights, k.id, departmentId, subUnitId, gradeBucket);
    if (!w || w.weight_pct <= 0) continue;
    total += Number(w.weight_pct);
    rows.push({
      kpi_id: k.id,
      key: k.key,
      name_en: k.name_en,
      name_hi: k.name_hi,
      uom_type: k.uom_type,
      weight_pct: Number(w.weight_pct),
      scoring_rules: parseScoringRules(k.scoring_rules) as unknown as Json,
    } as unknown as Json);
  }
  return { rows, total };
}

function templateName(
  cycle: FactoryRunInput['cycle'],
  deptName: string,
  subName: string | null,
  archetype: ArchetypeRow,
  bucket: GradeBucket,
): string {
  const ay = `AY ${cycle.review_year - 1}-${String(cycle.review_year % 100).padStart(2, '0')}`;
  const parts = [ay, deptName, subName, archetype.code, bucket].filter(Boolean);
  return parts.join(' · ');
}

function payloadFor(
  input: FactoryRunInput,
  archetype: ArchetypeRow,
  deptId: string,
  deptName: string,
  subUnitId: string | null,
  subUnitName: string | null,
  bucket: GradeBucket,
  systemRows: Json[],
  resolvedCriteria: ResolvedCriterion[] | null,
): { name: string; sections: Json; is_active: true } {
  const stageWeights = input.overrideStageWeights ?? parseStageWeights(archetype.default_stage_weights);
  // Prefer the Criteria Library resolver output. Fall back to the archetype
  // seed only when no library rows cover this cell (backward compat).
  const criteria = (
    resolvedCriteria && resolvedCriteria.length > 0
      ? resolvedCriteria.map((r) => ({
          // Reviewer form (`CriteriaScoringMatrix`) shape:
          id: r.key,
          name: r.label_en,
          weight: r.weight_pct,
          enable_remarks: true,
          options: bandsToBilingualOptions(r.scoring_bands, r.max_score),
          // Preserve original library payload for exports / debugging.
          key: r.key,
          label_en: r.label_en,
          label_hi: r.label_hi,
          max_score: r.max_score,
          scoring_bands: r.scoring_bands,
          weight_pct: r.weight_pct,
        }))
      : parseCriteria(archetype.default_criteria)
  ) as unknown as Json;
  const enabledStages = parseStringArray(archetype.default_enabled_stages);
  const factoryKey: FactoryKey = {
    cycle_id: input.cycle.id,
    department_id: deptId,
    sub_unit_id: subUnitId,
    archetype_code: archetype.code as ArchetypeCode,
    grade_bucket: bucket,
  };
  const sections = {
    factory_key: factoryKey as unknown as Json,
    archetype_code: archetype.code,
    grade_bucket: bucket,
    display_mode: archetype.display_mode,
    enabled_stages: enabledStages,
    stage_weights: stageWeights,
    criteria,
    criteria_source: resolvedCriteria && resolvedCriteria.length > 0 ? 'library' : 'archetype',
    system_scores: systemRows,
    translations: {
      name_en: templateName(input.cycle, deptName, subUnitName, archetype, bucket),
      name_hi: archetype.name_hi ?? null,
    },
    generated_by_factory: true,
    generated_at: new Date().toISOString(),
  } as unknown as Json;
  return {
    name: templateName(input.cycle, deptName, subUnitName, archetype, bucket),
    sections,
    is_active: true,
  };
}

/** Dry-run the factory: compute all planned template rows without writing. */
export async function previewFactoryRun(input: FactoryRunInput): Promise<PlannedRow[]> {
  if (!input.departmentIds.length) throw new Error('Pick at least one department.');
  if (!input.archetypeCodes.length) throw new Error('Pick at least one archetype.');
  if (!input.gradeBuckets.length) throw new Error('Pick at least one grade bucket.');
  const subUnitIds = input.subUnitIds.length ? input.subUnitIds : [null];

  const [archetypes, kpis, weights, critLib, critAsg, existing, org] = await Promise.all([
    listArchetypes(),
    listSystemKpis(),
    listSystemKpiWeights(),
    listCriteriaLibrary(),
    listCriteriaAssignments(),
    listFactoryTemplates(input.cycle.id),
    loadOrgLookup(
      input.departmentIds,
      input.subUnitIds.filter((s): s is string => typeof s === 'string'),
    ),
  ]);

  const archetypeByCode = new Map(archetypes.map((a) => [a.code, a]));
  const plans: PlannedRow[] = [];

  for (const deptId of input.departmentIds) {
    for (const subId of subUnitIds) {
      for (const code of input.archetypeCodes) {
        const archetype = archetypeByCode.get(code);
        if (!archetype || !archetype.is_active) continue;
        const bucketsForArchetype = parseStringArray(archetype.applies_to_grade_buckets);
        for (const bucket of input.gradeBuckets) {
          // Respect archetype's declared grade buckets (if any listed).
          if (bucketsForArchetype.length && !bucketsForArchetype.includes(bucket)) continue;
          const { rows, total } = buildSystemScoresSection(
            kpis, weights, deptId, subId, bucket,
          );
          const resolvedCriteria = resolveCriteria(critLib, critAsg, {
            archetype: code, grade: bucket, dept: deptId, subUnit: subId,
          });
          const critWeights = validateResolvedWeights(resolvedCriteria);
          const deptName = org.departments[deptId] ?? deptId.slice(0, 8);
          const subName = subId ? (org.subUnits[subId] ?? subId.slice(0, 8)) : null;
          const payload = payloadFor(
            input, archetype, deptId, deptName, subId, subName, bucket, rows, resolvedCriteria,
          );
          const key: FactoryKey = {
            cycle_id: input.cycle.id,
            department_id: deptId,
            sub_unit_id: subId,
            archetype_code: code,
            grade_bucket: bucket,
          };
          const existingRow = existing.find((r) => matchFactoryKey(r, key)) ?? null;
          const action: PlannedRow['action'] = existingRow ? 'update' : 'create';
          plans.push({
            key,
            action,
            templateName: payload.name,
            departmentName: deptName,
            subUnitName: subName,
            archetype,
            systemWeightTotal: total,
            criteriaCount: resolvedCriteria.length > 0
              ? resolvedCriteria.length
              : parseCriteria(archetype.default_criteria).length,
            criteriaSource: resolvedCriteria.length > 0 ? 'library' : 'archetype',
            criteriaWeightTotal: resolvedCriteria.length > 0 ? critWeights.sum : 0,
            criteriaWeightOk: resolvedCriteria.length > 0 ? critWeights.ok : true,
            existingId: existingRow?.id ?? null,
            payload,
          });
        }
      }
    }
  }
  return plans;
}

export interface CommitResult {
  created: number;
  updated: number;
  errors: { templateName: string; message: string }[];
}

/** Persist a previously-computed set of planned rows. Idempotent per factory_key. */
export async function commitFactoryRun(plans: PlannedRow[]): Promise<CommitResult> {
  const result: CommitResult = { created: 0, updated: 0, errors: [] };
  for (const p of plans) {
    try {
      // Hard-block library-sourced templates whose criterion weights don't sum to 100.
      // Archetype-fallback templates carry no weights and are exempt.
      if (p.criteriaSource === 'library' && !p.criteriaWeightOk) {
        throw new Error(
          `Criteria weights sum to ${p.criteriaWeightTotal}, must be 100. ` +
          `Fix in Criteria Matrix.`,
        );
      }
      if (p.existingId) {
        const { error } = await supabase
          .from('annual_review_templates')
          .update({
            name: p.payload.name,
            sections: p.payload.sections,
            is_active: true,
          })
          .eq('id', p.existingId);
        if (error) throw error;
        result.updated += 1;
      } else {
        const { error } = await supabase
          .from('annual_review_templates')
          .insert({
            name: p.payload.name,
            sections: p.payload.sections,
            is_active: true,
          });
        if (error) throw error;
        result.created += 1;
      }
    } catch (e) {
      result.errors.push({
        templateName: p.templateName,
        message: (e as Error).message,
      });
    }
  }
  return result;
}