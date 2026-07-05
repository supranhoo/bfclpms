import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import type {
  BfclParseResult, ParsedAssignment, ParsedSystemKpiWeight,
} from '@/lib/annualReview/bfclFormsWorkbook';

export interface BfclCommitResult {
  criteriaUpserted: number;
  assignmentsUpserted: number;
  systemWeightsUpserted: number;
  skipped: {
    unknownBu: string[];
    unknownDept: string[];
    unknownSystemKpi: string[];
  };
}

/**
 * Commit the parsed BFCL workbook to the database:
 *  1. Upsert criteria library rows (idempotent on `key`).
 *  2. Upsert criteria assignments (dept-scoped, no sub-unit).
 *  3. Upsert system KPI weights per (dept, grade_bucket).
 *
 * Eligibility gates + self-review fields are surfaced in the parse result but
 * NOT auto-committed (they already have their own admin panels).
 */
export async function commitBfclImport(plan: BfclParseResult): Promise<BfclCommitResult> {
  const result: BfclCommitResult = {
    criteriaUpserted: 0,
    assignmentsUpserted: 0,
    systemWeightsUpserted: 0,
    skipped: { unknownBu: [], unknownDept: [], unknownSystemKpi: [] },
  };

  // ─── Step 1: criteria library upsert ─────────────────────────
  if (plan.criteria.length) {
    const rows = plan.criteria.map((c, idx) => ({
      key: c.key,
      label_en: c.label_en,
      label_hi: c.label_hi,
      max_score: c.max_score,
      scoring_bands: c.scoring_bands as unknown as Json,
      is_common: c.is_common,
      is_active: true,
      sort_order: idx,
    }));
    const { error } = await supabase
      .from('annual_review_criteria_library')
      .upsert(rows, { onConflict: 'key' });
    if (error) throw new Error(`Criteria library upsert failed: ${error.message}`);
    result.criteriaUpserted = rows.length;
  }

  // Re-fetch to get ids for the assignments step.
  const { data: libRows, error: libErr } = await supabase
    .from('annual_review_criteria_library')
    .select('id, key');
  if (libErr) throw libErr;
  const critIdByKey = new Map<string, string>();
  (libRows ?? []).forEach((r) => critIdByKey.set(r.key, r.id));

  // ─── Lookup tables (BU code → id, dept name → id per BU) ────
  const { data: bus, error: buErr } = await supabase
    .from('business_units')
    .select('id, code, name');
  if (buErr) throw buErr;
  const buIdByCode = new Map<string, string>();
  (bus ?? []).forEach((b) => {
    if (b.code) buIdByCode.set(b.code.toUpperCase(), b.id);
    if (b.name) buIdByCode.set(b.name.toUpperCase(), b.id);
  });

  const { data: depts, error: dErr } = await supabase
    .from('departments')
    .select('id, name, code, business_unit_id');
  if (dErr) throw dErr;
  const deptIdByBuAndName = new Map<string, string>();
  (depts ?? []).forEach((d) => {
    const key = `${d.business_unit_id ?? ''}::${(d.name ?? '').trim().toUpperCase()}`;
    deptIdByBuAndName.set(key, d.id);
    if (d.code) {
      const ck = `${d.business_unit_id ?? ''}::${d.code.trim().toUpperCase()}`;
      deptIdByBuAndName.set(ck, d.id);
    }
  });

  // Resolve every unique (bu, dept) pair once.
  function resolveDept(a: ParsedAssignment | ParsedSystemKpiWeight): string | null {
    const buId = buIdByCode.get(a.buCode.toUpperCase());
    if (!buId) {
      if (!result.skipped.unknownBu.includes(a.buCode)) result.skipped.unknownBu.push(a.buCode);
      return null;
    }
    const key = `${buId}::${a.deptName.trim().toUpperCase()}`;
    const deptId = deptIdByBuAndName.get(key);
    if (!deptId) {
      const tag = `${a.buCode}/${a.deptName}`;
      if (!result.skipped.unknownDept.includes(tag)) result.skipped.unknownDept.push(tag);
      return null;
    }
    return deptId;
  }

  // ─── Step 2: assignments upsert (delete-then-insert per cell) ─
  // Group assignments by (criterion_id, dept, grade_bucket) and take the last
  // weight seen (workbook duplicates share). Then delete existing rows for
  // those (criterion × cell) triples and insert fresh — matches the "commit
  // is idempotent" contract without needing the composite unique index.
  interface FlatAssign {
    criterion_id: string;
    department_id: string;
    grade_bucket: string;
    weight_pct: number;
  }
  const flat: FlatAssign[] = [];
  const seenCell = new Set<string>();
  for (const a of plan.assignments) {
    const critId = critIdByKey.get(a.criterionKey);
    if (!critId) continue;
    const deptId = resolveDept(a);
    if (!deptId) continue;
    const cellKey = `${critId}|${deptId}|${a.gradeBucket}`;
    if (seenCell.has(cellKey)) continue;
    seenCell.add(cellKey);
    flat.push({
      criterion_id: critId,
      department_id: deptId,
      grade_bucket: a.gradeBucket,
      weight_pct: a.weight_pct,
    });
  }

  if (flat.length) {
    // Delete matching rows in chunks by (criterion_id, department_id, grade_bucket).
    // Group deletes by criterion_id to keep query counts sane.
    const byCrit = new Map<string, FlatAssign[]>();
    for (const f of flat) {
      const arr = byCrit.get(f.criterion_id) ?? [];
      arr.push(f);
      byCrit.set(f.criterion_id, arr);
    }
    for (const [critId, rows] of byCrit) {
      const depts = Array.from(new Set(rows.map((r) => r.department_id)));
      const buckets = Array.from(new Set(rows.map((r) => r.grade_bucket)));
      const { error } = await supabase
        .from('annual_review_criteria_assignments')
        .delete()
        .eq('criterion_id', critId)
        .in('department_id', depts)
        .in('grade_bucket', buckets)
        .is('sub_unit_id', null)
        .is('grade_code', null)
        .is('archetype_code', null);
      if (error) throw new Error(`Assignment cleanup failed: ${error.message}`);
    }
    // Insert fresh in chunks of 500.
    for (let i = 0; i < flat.length; i += 500) {
      const chunk = flat.slice(i, i + 500).map((r) => ({
        criterion_id: r.criterion_id,
        department_id: r.department_id,
        grade_bucket: r.grade_bucket,
        sub_unit_id: null,
        grade_code: null,
        archetype_code: null,
        weight_pct: r.weight_pct,
        is_enabled: true,
      }));
      const { error } = await supabase
        .from('annual_review_criteria_assignments')
        .insert(chunk);
      if (error) throw new Error(`Assignment insert failed: ${error.message}`);
      result.assignmentsUpserted += chunk.length;
    }
  }

  // ─── Step 3: system KPI weights ────────────────────────────
  const { data: sysKpis, error: sErr } = await supabase
    .from('annual_review_system_kpis')
    .select('id, key, name_en');
  if (sErr) throw sErr;
  const kpiIdByKey = new Map<string, string>();
  (sysKpis ?? []).forEach((k) => {
    kpiIdByKey.set(k.key.toLowerCase(), k.id);
    if (k.name_en) kpiIdByKey.set(k.name_en.toLowerCase(), k.id);
  });

  interface FlatSys {
    system_kpi_id: string;
    department_id: string;
    grade_bucket: string;
    weight_pct: number;
  }
  const flatSys: FlatSys[] = [];
  const seenSys = new Set<string>();
  for (const w of plan.systemWeights) {
    const kpiId =
      kpiIdByKey.get(w.kpiKey.toLowerCase()) ??
      kpiIdByKey.get(w.kpiLabel.toLowerCase());
    if (!kpiId) {
      if (!result.skipped.unknownSystemKpi.includes(w.kpiLabel)) {
        result.skipped.unknownSystemKpi.push(w.kpiLabel);
      }
      continue;
    }
    const deptId = resolveDept(w);
    if (!deptId) continue;
    const cellKey = `${kpiId}|${deptId}|${w.gradeBucket}`;
    if (seenSys.has(cellKey)) continue;
    seenSys.add(cellKey);
    flatSys.push({
      system_kpi_id: kpiId,
      department_id: deptId,
      grade_bucket: w.gradeBucket,
      weight_pct: w.weight_pct,
    });
  }

  if (flatSys.length) {
    // Same delete-then-insert approach.
    const byKpi = new Map<string, FlatSys[]>();
    for (const f of flatSys) {
      const arr = byKpi.get(f.system_kpi_id) ?? [];
      arr.push(f);
      byKpi.set(f.system_kpi_id, arr);
    }
    for (const [kpiId, rows] of byKpi) {
      const depts = Array.from(new Set(rows.map((r) => r.department_id)));
      const buckets = Array.from(new Set(rows.map((r) => r.grade_bucket)));
      const { error } = await supabase
        .from('annual_review_system_kpi_weights')
        .delete()
        .eq('system_kpi_id', kpiId)
        .in('department_id', depts)
        .in('grade_bucket', buckets)
        .is('sub_unit_id', null);
      if (error) throw new Error(`System weight cleanup failed: ${error.message}`);
    }
    for (let i = 0; i < flatSys.length; i += 500) {
      const chunk = flatSys.slice(i, i + 500).map((r) => ({
        system_kpi_id: r.system_kpi_id,
        department_id: r.department_id,
        grade_bucket: r.grade_bucket,
        sub_unit_id: null,
        weight_pct: r.weight_pct,
      }));
      const { error } = await supabase
        .from('annual_review_system_kpi_weights')
        .insert(chunk);
      if (error) throw new Error(`System weight insert failed: ${error.message}`);
      result.systemWeightsUpserted += chunk.length;
    }
  }

  return result;
}