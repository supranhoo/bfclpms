import { supabase } from '@/integrations/supabase/client';
import * as XLSX from 'xlsx';
import * as svc from '@/services/annualReview/annualReviewService';
import { resolveTemplateId } from '@/services/annualReview/annualReviewService';
import type { AnnualReviewTemplate, TemplateSystemScore } from '@/types/annualReview';
import { scoreFromRaw, type ScoringRules } from '@/lib/annualReview/systemKpiScoring';
import { resolveLibraryKeyByName, normalizeSlotName } from '@/lib/annualReview/systemKpiAliases';

/**
 * Cycle-wide "single sheet" bulk data uploader for Annual Review.
 *
 * Consolidates System KPI raw values + Eligibility Inputs across every form
 * (archetypes A/B/C/D) into ONE workbook. Columns that share the same name
 * across templates collapse into a single column — the resolver maps that
 * column back to each instance's effective template ID on write.
 *
 * Stage-safe: only writes to instances in not_started / pending_self /
 * pending_manager. Never touches finalized / acknowledged rows.
 */

export type CellKind = 'system_scores' | 'eligibility_inputs';

export interface CanonicalColumn {
  /** Canonical (display) column header. */
  name: string;
  kind: CellKind;
  /** Optional description picked from the first template that defines it. */
  description?: string | null;
}

export interface InstanceCtx {
  instanceId: string;
  employeeCode: string;
  fullName: string;
  doj: string | null;
  departmentName: string;
  businessUnitName: string;
  companyName: string;
  hasKra: boolean;
  templateName: string;
  overallStatus: string;
  /** Per-canonical-name resolution back to the template's slot id. */
  slotByCanonical: Map<string, { kind: CellKind; id: string; slot?: TemplateSystemScore }>;
  systemScores: Record<string, number>;
  systemScoresRaw: Record<string, number>;
  eligibilityInputs: Record<string, string | number | boolean>;
}

export interface CycleBulkPlan {
  cycleId: string;
  columns: CanonicalColumn[];
  instances: InstanceCtx[];
  /**
   * System-KPI slot names that could NOT be resolved to the KPI Library at
   * plan-build time. When non-empty the Bulk Upload dialog surfaces an amber
   * "Scoring health" strip and Commit is blocked for the affected column(s).
   * See POLICY §AR-SYSTEM-KPI-LIBRARY-LINK.
   */
  unresolvedSlots: Array<{ name: string; templateNames: string[] }>;
}

const STAGE_SAFE = new Set(['not_started', 'pending_self', 'pending_manager']);

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Hydrate template `system_scores[]` slots with `scoring_rules` copied from the
 * KPI Library when the slot itself has none. Resolution order (v2.66.91):
 *   1. `slot.library_key` — the stable link written by the Template Editor / backfill.
 *   2. Alias map (`SYSTEM_KPI_ALIASES`) — deterministic, covers historical drift.
 *   3. Exact normalized-name match against `annual_review_system_kpis.name_en`.
 *   4. Unresolved — collected and returned so the dialog can surface it. NEVER
 *      silently degraded to the legacy "raw = pre-scaled points" branch, which
 *      inverts the score for lower-is-better KPIs (LTI, STI, Fugitive PM10 …).
 * POLICY §AR-SYSTEM-KPI-RAW-INPUT, §AR-SYSTEM-KPI-LIBRARY-LINK.
 * Returns an array of unresolved slot names paired with the templates that
 * still expose them, so the caller can render a health strip.
 */
async function hydrateSystemScoringRules(
  templates: Iterable<AnnualReviewTemplate>,
): Promise<Array<{ name: string; templateNames: string[] }>> {
  const need = new Set<string>();
  // Preserve iteration for the second pass — Iterable<T> can be single-use.
  const templateList = Array.from(templates);
  for (const t of templates) {
    for (const s of t.sections.system_scores ?? []) {
      const src = (s as unknown as { source?: string }).source;
      if (src === 'carry_kra') continue;
      if (!s.scoring_rules || !s.scoring_rules.bands?.length) need.add(norm(s.name));
    }
  }
  if (!need.size) return [];
  const { data, error } = await supabase
    .from('annual_review_system_kpis')
    .select('key, name_en, scoring_rules, uom_type');
  if (error) throw error;
  const libByKey = new Map<string, { rules: ScoringRules | null; uom?: string | null }>();
  const libByName = new Map<string, { rules: ScoringRules | null; uom?: string | null }>();
  for (const r of (data ?? []) as Array<{ key: string; name_en: string; scoring_rules: unknown; uom_type: string | null }>) {
    const entry = { rules: (r.scoring_rules as ScoringRules) ?? null, uom: r.uom_type };
    if (r.key) libByKey.set(r.key, entry);
    libByName.set(norm(r.name_en), entry);
  }

  const unresolved = new Map<string, Set<string>>(); // slot name → set of template names
  for (const t of templateList) {
    for (const s of t.sections.system_scores ?? []) {
      const src = (s as unknown as { source?: string }).source;
      if (src === 'carry_kra') continue;
      if (s.scoring_rules && s.scoring_rules.bands?.length) continue;

      // 1. Prefer explicit library_key link if present.
      let hit = s.library_key ? libByKey.get(s.library_key) : undefined;
      // 2. Fall back to the deterministic alias map.
      if (!hit?.rules?.bands?.length) {
        const aliasKey = resolveLibraryKeyByName(s.name);
        if (aliasKey) hit = libByKey.get(aliasKey);
      }
      // 3. Last resort — exact normalized-name match.
      if (!hit?.rules?.bands?.length) {
        hit = libByName.get(norm(s.name));
      }

      if (hit?.rules?.bands?.length) {
        s.scoring_rules = hit.rules;
        if (!s.uom_type && hit.uom) s.uom_type = hit.uom;
      } else {
        const key = s.name.trim();
        if (!unresolved.has(key)) unresolved.set(key, new Set());
        unresolved.get(key)!.add(t.name);
      }
    }
  }
  return Array.from(unresolved.entries()).map(([name, tpls]) => ({
    name,
    templateNames: Array.from(tpls).sort((a, b) => a.localeCompare(b)),
  }));
}

/**
 * Exposed for unit tests — pure helper that runs the same resolution order
 * against an already-fetched library snapshot. Returns unresolved slot names.
 */
export function __resolveScoringRulesForTests(
  templates: AnnualReviewTemplate[],
  library: Array<{ key: string; name_en: string; scoring_rules: ScoringRules | null; uom_type: string | null }>,
): Array<{ name: string; templateNames: string[] }> {
  const libByKey = new Map(library.map((r) => [r.key, { rules: r.scoring_rules, uom: r.uom_type }] as const));
  const libByName = new Map(library.map((r) => [normalizeSlotName(r.name_en), { rules: r.scoring_rules, uom: r.uom_type }] as const));
  const unresolved = new Map<string, Set<string>>();
  for (const t of templates) {
    for (const s of t.sections.system_scores ?? []) {
      const src = (s as unknown as { source?: string }).source;
      if (src === 'carry_kra') continue;
      if (s.scoring_rules && s.scoring_rules.bands?.length) continue;
      let hit = s.library_key ? libByKey.get(s.library_key) : undefined;
      if (!hit?.rules?.bands?.length) {
        const aliasKey = resolveLibraryKeyByName(s.name);
        if (aliasKey) hit = libByKey.get(aliasKey);
      }
      if (!hit?.rules?.bands?.length) {
        hit = libByName.get(normalizeSlotName(s.name));
      }
      if (hit?.rules?.bands?.length) {
        s.scoring_rules = hit.rules;
        if (!s.uom_type && hit.uom) s.uom_type = hit.uom;
      } else {
        const key = s.name.trim();
        if (!unresolved.has(key)) unresolved.set(key, new Set());
        unresolved.get(key)!.add(t.name);
      }
    }
  }
  return Array.from(unresolved.entries()).map(([name, tpls]) => ({
    name,
    templateNames: Array.from(tpls).sort((a, b) => a.localeCompare(b)),
  }));
}

/** Fetches everything needed to build the single sheet for a cycle. */
export async function buildCycleBulkPlan(cycleId: string): Promise<CycleBulkPlan> {
  // Instances + employee master (paged for safety).
  const instances: svc.InstanceWithEmployee[] = [];
  const PAGE = 500;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('annual_review_instances')
      .select(
        '*, employee:profiles!annual_review_instances_employee_id_fkey(id, full_name, employee_code, designation, doj, department_id, company_id)'
      )
      .eq('cycle_id', cycleId)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    instances.push(...((data ?? []) as svc.InstanceWithEmployee[]));
    if (!data || data.length < PAGE) break;
  }

  const templateIds = Array.from(
    new Set(instances.map((i) => resolveTemplateId(i)).filter(Boolean))
  ) as string[];

  const templateById = new Map<string, AnnualReviewTemplate>();
  if (templateIds.length) {
    const { data, error } = await supabase
      .from('annual_review_templates')
      .select('*')
      .in('id', templateIds);
    if (error) throw error;
    (data ?? []).forEach((t) => templateById.set(t.id, t as unknown as AnnualReviewTemplate));
  }
  const unresolvedSlots = await hydrateSystemScoringRules(templateById.values());

  // Master-data lookups.
  const deptIds = Array.from(
    new Set(instances.map((i) => i.employee?.['department_id'] as string | undefined).filter(Boolean))
  ) as string[];
  const companyIds = Array.from(
    new Set(instances.map((i) => i.employee?.['company_id'] as string | undefined).filter(Boolean))
  ) as string[];

  const deptById = new Map<string, { name: string; buId: string | null }>();
  if (deptIds.length) {
    const { data } = await supabase
      .from('departments')
      .select('id, name, business_unit_id')
      .in('id', deptIds);
    (data ?? []).forEach((d) => deptById.set(d.id, { name: d.name, buId: d.business_unit_id }));
  }
  const buIds = Array.from(new Set(Array.from(deptById.values()).map((d) => d.buId).filter(Boolean))) as string[];
  const buById = new Map<string, string>();
  if (buIds.length) {
    const { data } = await supabase.from('business_units').select('id, name').in('id', buIds);
    (data ?? []).forEach((b) => buById.set(b.id, b.name));
  }
  const companyById = new Map<string, string>();
  if (companyIds.length) {
    const { data } = await supabase.from('companies').select('id, name').in('id', companyIds);
    (data ?? []).forEach((c) => companyById.set(c.id, c.name));
  }

  // Build canonical column set.
  const canonicalOrder: string[] = [];
  const canonicalMeta = new Map<string, CanonicalColumn>();
  const upsertCol = (col: CanonicalColumn) => {
    const k = `${col.kind}::${norm(col.name)}`;
    if (canonicalMeta.has(k)) return;
    canonicalMeta.set(k, col);
    canonicalOrder.push(k);
  };
  // System KPIs first, then eligibility.
  for (const t of templateById.values()) {
    for (const s of t.sections.system_scores ?? []) {
      // Skip carry_kra — value is computed, not user-entered.
      const src = (s as unknown as { source?: string }).source;
      if (src === 'carry_kra') continue;
      upsertCol({ name: s.name, kind: 'system_scores', description: (s as unknown as { description?: string }).description ?? null });
    }
  }
  for (const t of templateById.values()) {
    for (const c of t.sections.eligibility_criteria ?? []) {
      upsertCol({ name: c.name, kind: 'eligibility_inputs', description: null });
    }
  }

  const columns = canonicalOrder.map((k) => canonicalMeta.get(k)!);

  // Build per-instance context.
  const instanceCtx: InstanceCtx[] = instances.map((i) => {
    const tId = resolveTemplateId(i);
    const t = tId ? templateById.get(tId) : null;
    const slotByCanonical = new Map<string, { kind: CellKind; id: string; slot?: TemplateSystemScore }>();
    for (const s of t?.sections.system_scores ?? []) {
      const src = (s as unknown as { source?: string }).source;
      if (src === 'carry_kra') continue;
      slotByCanonical.set(`system_scores::${norm(s.name)}`, { kind: 'system_scores', id: s.id, slot: s });
    }
    for (const c of t?.sections.eligibility_criteria ?? []) {
      slotByCanonical.set(`eligibility_inputs::${norm(c.name)}`, { kind: 'eligibility_inputs', id: c.id });
    }
    const emp = i.employee as (svc.InstanceWithEmployee['employee'] & { doj?: string | null; department_id?: string | null; company_id?: string | null }) | undefined;
    const dept = emp?.department_id ? deptById.get(emp.department_id) : null;
    const buName = dept?.buId ? buById.get(dept.buId) ?? '' : '';
    const companyName = emp?.company_id ? companyById.get(emp.company_id) ?? '' : '';
    // Has KRA = archetype A ⇒ template's archetype code. Fallback: template name contains 'KRA'.
    const arche = (t as unknown as { sections?: { settings?: { archetype_code?: string } } })?.sections?.settings?.archetype_code;
    const hasKra = arche ? arche === 'A' : (t?.name ?? '').toUpperCase().includes('KRA');
    return {
      instanceId: i.id,
      employeeCode: emp?.employee_code ?? '',
      fullName: emp?.full_name ?? '',
      doj: emp?.doj ?? null,
      departmentName: dept?.name ?? '',
      businessUnitName: buName,
      companyName,
      hasKra,
      templateName: t?.name ?? '',
      overallStatus: i.overall_status,
      slotByCanonical,
      systemScores: (i.system_scores as Record<string, number>) ?? {},
      systemScoresRaw: ((i as unknown as { system_scores_raw?: Record<string, number> }).system_scores_raw as Record<string, number>) ?? {},
      eligibilityInputs: (i.eligibility_inputs as Record<string, string | number | boolean>) ?? {},
    };
  });

  return { cycleId, columns, instances: instanceCtx, unresolvedSlots };
}

/** Serialize the current plan to an XLSX workbook with editable canonical columns. */
export function downloadBulkTemplate(plan: CycleBulkPlan, cycleLabel: string): void {
  const headers = [
    'Employee Code', 'Full Name', 'Has KRA', 'Date of Joining',
    'Company', 'Business Unit', 'Department', 'Template', 'Status',
    ...plan.columns.map((c) => c.name),
  ];
  const rows = plan.instances.map((i) => {
    const base: Record<string, unknown> = {
      'Employee Code': i.employeeCode,
      'Full Name': i.fullName,
      'Has KRA': i.hasKra ? 'Yes' : 'No',
      'Date of Joining': i.doj ?? '',
      'Company': i.companyName,
      'Business Unit': i.businessUnitName,
      'Department': i.departmentName,
      'Template': i.templateName,
      'Status': i.overallStatus,
    };
    for (const col of plan.columns) {
      const slot = i.slotByCanonical.get(`${col.kind}::${norm(col.name)}`);
      if (!slot) { base[col.name] = ''; continue; }
      if (col.kind === 'system_scores') {
        // Prefer the raw HR-entered value; fall back to legacy scaled value if raw is missing.
        const raw = i.systemScoresRaw[slot.id];
        base[col.name] = raw !== undefined && raw !== null ? raw : (i.systemScores[slot.id] ?? '');
      } else {
        base[col.name] = i.eligibilityInputs[slot.id] ?? '';
      }
    }
    return base;
  });
  const ws = XLSX.utils.json_to_sheet(rows, { header: headers });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Annual Review Data');
  XLSX.writeFile(wb, `annual-review-bulk-data-${cycleLabel}.xlsx`);
}

// ── Import ─────────────────────────────────────────────────────

export type RowVerdict = 'apply' | 'skip' | 'error';
export interface DryRunRow {
  employeeCode: string;
  fullName: string;
  verdict: RowVerdict;
  reason?: string;
  changes: Array<{
    column: string;
    kind: CellKind;
    /** Raw HR-entered value (for system_scores) or the eligibility value. */
    before: unknown;
    after: unknown;
    /** Only for system_scores: derived points from bands + weight. */
    beforePoints?: number;
    afterPoints?: number;
    /** Rating on 0..scale (system_scores with bands only). */
    rating?: number;
    weight?: number;
    matched?: boolean;
  }>;
}

export interface DryRunReport {
  rows: DryRunRow[];
  applyCount: number;
  skipCount: number;
  errorCount: number;
  totalChanges: number;
}

const MAX_ROWS = 5000;

export async function parseAndDryRun(file: File, plan: CycleBulkPlan): Promise<DryRunReport> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
  if (records.length > MAX_ROWS) {
    throw new Error(`Row cap exceeded (${records.length} > ${MAX_ROWS}). Split the file and retry.`);
  }
  const instByCode = new Map(plan.instances.map((i) => [i.employeeCode.trim(), i]));

  const rows: DryRunRow[] = [];
  let apply = 0, skip = 0, err = 0, changes = 0;

  for (const rec of records) {
    const code = String(rec['Employee Code'] ?? '').trim();
    if (!code) continue;
    const inst = instByCode.get(code);
    if (!inst) {
      rows.push({ employeeCode: code, fullName: String(rec['Full Name'] ?? ''), verdict: 'error', reason: 'Employee not found in cycle', changes: [] });
      err++;
      continue;
    }
    if (!STAGE_SAFE.has(inst.overallStatus)) {
      rows.push({ employeeCode: code, fullName: inst.fullName, verdict: 'skip', reason: `Locked stage: ${inst.overallStatus}`, changes: [] });
      skip++;
      continue;
    }
    const rowChanges: DryRunRow['changes'] = [];
    for (const col of plan.columns) {
      const raw = rec[col.name];
      if (raw === null || raw === undefined || raw === '') continue;
      const slot = inst.slotByCanonical.get(`${col.kind}::${norm(col.name)}`);
      if (!slot) continue; // column not applicable to this employee's template
      if (col.kind === 'system_scores') {
        const afterRaw = Number(raw);
        if (!Number.isFinite(afterRaw)) {
          rows.push({ employeeCode: code, fullName: inst.fullName, verdict: 'error', reason: `Non-numeric value in "${col.name}"`, changes: [] });
          err++;
          rowChanges.length = 0;
          break;
        }
        const beforeRaw = inst.systemScoresRaw[slot.id];
        const tSlot = slot.slot as TemplateSystemScore | undefined;
        const rules = (tSlot?.scoring_rules ?? null) as ScoringRules | null;
        const weight = Number(tSlot?.weight ?? 0);
        // Guardrail (v2.66.91): a library-linked KPI slot with no resolvable
        // bands MUST NOT fall into the legacy "raw = pre-scaled points" branch,
        // which would silently invert the score for lower-is-better metrics.
        // Only explicitly `source: 'manual'` slots may skip band scoring.
        const isManual = (tSlot?.source ?? 'manual') === 'manual';
        if (!isManual && (!rules || !rules.bands?.length)) {
          rows.push({
            employeeCode: code,
            fullName: inst.fullName,
            verdict: 'error',
            reason: `Column "${col.name}" is not linked to the KPI Library (no scoring bands). Open the template and link this slot before uploading.`,
            changes: [],
          });
          err++;
          rowChanges.length = 0;
          break;
        }
        const result = scoreFromRaw(afterRaw, rules, weight);
        const beforePoints = inst.systemScores[slot.id];
        if (beforeRaw === afterRaw && Number(beforePoints ?? NaN) === result.points) continue;
        rowChanges.push({
          column: col.name,
          kind: 'system_scores',
          before: beforeRaw ?? '',
          after: afterRaw,
          beforePoints: typeof beforePoints === 'number' ? beforePoints : undefined,
          afterPoints: result.points,
          rating: result.rating,
          weight,
          matched: result.matched,
        });
      } else {
        const before = inst.eligibilityInputs[slot.id];
        const after = typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean' ? raw : String(raw);
        if (before === after) continue;
        rowChanges.push({ column: col.name, kind: 'eligibility_inputs', before, after });
      }
    }
    if (rowChanges.length === 0) {
      // Only push a skip if not already error'd
      if (rows[rows.length - 1]?.employeeCode !== code || rows[rows.length - 1]?.verdict !== 'error') {
        rows.push({ employeeCode: code, fullName: inst.fullName, verdict: 'skip', reason: 'No changes', changes: [] });
        skip++;
      }
      continue;
    }
    rows.push({ employeeCode: code, fullName: inst.fullName, verdict: 'apply', changes: rowChanges });
    apply++;
    changes += rowChanges.length;
  }

  return { rows, applyCount: apply, skipCount: skip, errorCount: err, totalChanges: changes };
}

export interface CommitResult { updated: number; failed: number; errors: string[] }

export async function commitDryRun(report: DryRunReport, plan: CycleBulkPlan): Promise<CommitResult> {
  const out: CommitResult = { updated: 0, failed: 0, errors: [] };
  const instByCode = new Map(plan.instances.map((i) => [i.employeeCode.trim(), i]));
  for (const row of report.rows) {
    if (row.verdict !== 'apply') continue;
    const inst = instByCode.get(row.employeeCode);
    if (!inst) continue;
    const nextSys: Record<string, number> = { ...inst.systemScores };
    const nextSysRaw: Record<string, number> = { ...inst.systemScoresRaw };
    const nextElig: Record<string, string | number | boolean> = { ...inst.eligibilityInputs };
    for (const ch of row.changes) {
      const col = plan.columns.find((c) => c.name === ch.column);
      if (!col) continue;
      const slot = inst.slotByCanonical.get(`${col.kind}::${norm(col.name)}`);
      if (!slot) continue;
      if (col.kind === 'system_scores') {
        nextSysRaw[slot.id] = Number(ch.after);
        nextSys[slot.id] = typeof ch.afterPoints === 'number' ? ch.afterPoints : Number(ch.after);
      } else {
        nextElig[slot.id] = ch.after as string | number | boolean;
      }
    }
    try {
      await svc.updateInstance(inst.instanceId, {
        system_scores: nextSys,
        system_scores_raw: nextSysRaw,
        eligibility_inputs: nextElig,
      });
      out.updated++;
    } catch (e) {
      out.failed++;
      out.errors.push(`${row.employeeCode}: ${(e as Error).message}`);
    }
  }
  return out;
}