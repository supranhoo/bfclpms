import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import {
  listFactoryTemplates,
  type FactoryKey, type TemplateRow, type ArchetypeCode, type GradeBucket,
} from './templateFactory';
import { listArchetypes, parseCriteria, parseStageWeights } from './templateArchetypes';
import { listSystemKpis, listSystemKpiWeights, resolveWeight, parseScoringRules } from './systemKpiLibrary';
import { listCriteriaLibrary, listCriteriaAssignments, resolveCriteria } from './criteriaLibrary';

function readFactoryKey(row: TemplateRow): FactoryKey | null {
  const s = (row.sections ?? {}) as Record<string, unknown>;
  const fk = s.factory_key as Record<string, unknown> | undefined;
  if (!fk?.cycle_id || !fk.archetype_code || !fk.grade_bucket) return null;
  return {
    cycle_id: String(fk.cycle_id),
    department_id: (fk.department_id as string | null) ?? null,
    sub_unit_id: (fk.sub_unit_id as string | null) ?? null,
    archetype_code: fk.archetype_code as ArchetypeCode,
    grade_bucket: fk.grade_bucket as GradeBucket,
  };
}

export interface RebuildResult {
  scanned: number;
  updated: number;
  skipped: number;
  errors: { name: string; message: string }[];
}

/**
 * Rebuild `sections.system_scores` (and refresh archetype-owned `criteria`,
 * `stage_weights`, `display_mode`, `enabled_stages`) for every factory-
 * generated template in a cycle. Idempotent — safe to run repeatedly after
 * editing the KPI library, weight matrix, or archetype defaults.
 *
 * Preserves any manual edits made outside those slots (audit trail, custom
 * metadata) by only overwriting the specific fields it owns.
 */
export async function rebuildFactoryTemplatesForCycle(cycleId: string): Promise<RebuildResult> {
  const res: RebuildResult = { scanned: 0, updated: 0, skipped: 0, errors: [] };
  const [templates, archetypes, kpis, weights, critLib, critAsg] = await Promise.all([
    listFactoryTemplates(cycleId),
    listArchetypes(),
    listSystemKpis(),
    listSystemKpiWeights(),
    listCriteriaLibrary(),
    listCriteriaAssignments(),
  ]);
  const archetypeByCode = new Map(archetypes.map((a) => [a.code, a]));

  for (const t of templates) {
    res.scanned += 1;
    const key = readFactoryKey(t);
    if (!key) { res.skipped += 1; continue; }
    const archetype = archetypeByCode.get(key.archetype_code);
    if (!archetype) { res.skipped += 1; continue; }

    // Recompute system_scores.
    const systemRows: Json[] = [];
    for (const k of kpis) {
      if (!k.is_active) continue;
      const w = resolveWeight(weights, k.id, key.department_id, key.sub_unit_id, key.grade_bucket);
      if (!w || w.weight_pct <= 0) continue;
      systemRows.push({
        kpi_id: k.id,
        key: k.key,
        name_en: k.name_en,
        name_hi: k.name_hi,
        uom_type: k.uom_type,
        weight_pct: Number(w.weight_pct),
        scoring_rules: parseScoringRules(k.scoring_rules) as unknown as Json,
      } as unknown as Json);
    }

    const prev = (t.sections ?? {}) as Record<string, unknown>;
    const resolved = resolveCriteria(critLib, critAsg, {
      archetype: key.archetype_code, grade: key.grade_bucket,
      dept: key.department_id, subUnit: key.sub_unit_id,
    });
    const criteria = resolved.length > 0
      ? resolved.map((r) => ({
          key: r.key, label_en: r.label_en, label_hi: r.label_hi,
          max_score: r.max_score, scoring_bands: r.scoring_bands, weight_pct: r.weight_pct,
        }))
      : parseCriteria(archetype.default_criteria);
    const merged: Record<string, unknown> = {
      ...prev,
      display_mode: archetype.display_mode,
      criteria: criteria as unknown as Json,
      criteria_source: resolved.length > 0 ? 'library' : 'archetype',
      // stage_weights: keep manual per-template override if it was set outside
      // the archetype default; otherwise refresh from archetype.
      stage_weights: prev.stage_weights ?? parseStageWeights(archetype.default_stage_weights),
      system_scores: systemRows,
      rebuilt_at: new Date().toISOString(),
    };

    try {
      const { error } = await supabase
        .from('annual_review_templates')
        .update({ sections: merged as unknown as Json })
        .eq('id', t.id);
      if (error) throw error;
      res.updated += 1;
    } catch (e) {
      res.errors.push({ name: t.name, message: (e as Error).message });
    }
  }
  return res;
}