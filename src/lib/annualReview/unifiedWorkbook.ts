/**
 * Unified Annual Review bulk workbook (v2.66.36).
 *
 * One workbook to download AND upload. Replaces the four separate per-feature
 * sheets (system scores / template assignment / workflow assignment / stage
 * weights). Editable columns for every feature live on a single row per
 * employee. The upload pipeline is **delta-only**: it compares each editable
 * cell against a hidden `__baseline` snapshot embedded at download time, and
 * applies ONLY the cells the user actually changed. Anything left untouched
 * (or where the user re-typed the same value) is skipped — preserving every
 * governance rule from the legacy single-purpose dialogs.
 *
 * Routing: changes are dispatched to the existing service-layer RPCs —
 *   - template     → bulkSetTemplateOverrides
 *   - workflow Y/N → bulkSetEnabledStages
 *   - stage weights → bulkSetStageWeightsOverrides
 *   - system_scores / eligibility → updateInstance
 * so RLS, audit logs, and eligibility gates remain unchanged.
 */
import * as XLSX from 'xlsx';
import * as svc from '@/services/annualReview/annualReviewService';
import type {
  AnnualReviewCycle, AnnualReviewTemplate, AnnualReviewerRole,
} from '@/types/annualReview';
import { enabledChain } from '@/lib/annualReview/stageChain';
import {
  resolveStageWeights, isValidStageWeights, STAGE_WEIGHT_KEYS,
  type StageWeightKey, type StageWeights,
} from '@/lib/annualReview/finalScore';

const SHEET_MAIN = 'Annual Review';
const SHEET_BASE = '__baseline';
const SHEET_README = 'README';

const COL_INSTANCE_ID = 'Instance ID';
const COL_REASON = 'Reason';

// Column header prefixes — kept short so the workbook stays readable.
const TPL_NEW = 'New Template';
const TPL_CUR = 'Current Template';
const WF_KEYS: { col: string; role: AnnualReviewerRole }[] = [
  { col: 'WF Self',    role: 'self' },
  { col: 'WF Manager', role: 'manager' },
  { col: 'WF Skip',    role: 'skip_manager' },
  { col: 'WF BU',      role: 'bu_head' },
  { col: 'WF HR',      role: 'hr' },
];
const WT_COL: Record<StageWeightKey, string> = {
  self:         'WT Self %',
  manager:      'WT Manager %',
  skip_manager: 'WT Skip %',
  bu_head:      'WT BU %',
  hr:           'WT HR %',
  system:       'WT System %',
  criteria:     'WT Criteria %',
};

const TRUTHY = new Set(['Y', 'YES', 'TRUE', '1', 'X', '✓']);
const FALSY = new Set(['N', 'NO', 'FALSE', '0']);

function parseYN(raw: unknown): boolean | null {
  const v = String(raw ?? '').trim().toUpperCase();
  if (v === '') return null;
  if (TRUTHY.has(v)) return true;
  if (FALSY.has(v)) return false;
  return null;
}

function strCell(raw: unknown): string {
  return String(raw ?? '').trim();
}

function numOrBlank(v: number | null | undefined): string {
  return v == null ? '' : String(v);
}

// ---------------- Builder ----------------

export interface BuildUnifiedArgs {
  cycle: AnnualReviewCycle;
  instances: svc.InstanceWithEmployee[];
  templates: AnnualReviewTemplate[];
  /** Default template used to seed System / Eligibility columns (header list). */
  systemTemplate: AnnualReviewTemplate | null;
}

export function buildUnifiedWorkbook(args: BuildUnifiedArgs): XLSX.WorkBook {
  const { instances, templates, systemTemplate } = args;
  const tplById = new Map(templates.map((t) => [t.id, t]));
  const sysCols = systemTemplate?.sections.system_scores ?? [];
  const eligCols = systemTemplate?.sections.eligibility_criteria ?? [];

  const mainHeaders: string[] = [
    COL_INSTANCE_ID, 'Employee Code', 'Full Name', 'Designation', 'Current Stage',
    TPL_CUR, TPL_NEW,
    ...WF_KEYS.map((w) => w.col),
    ...STAGE_WEIGHT_KEYS.map((k) => WT_COL[k]),
    ...sysCols.map((s) => `SYS ${s.name}`),
    ...eligCols.map((c) => `ELG ${c.name}`),
    COL_REASON,
  ];

  const main: Record<string, unknown>[] = [];
  const baseline: Record<string, unknown>[] = [];

  for (const i of instances) {
    const tplId = svc.resolveTemplateId(i);
    const tpl = tplId ? tplById.get(tplId) ?? null : null;
    const weights = resolveStageWeights(i, tpl);
    const chain = new Set<AnnualReviewerRole>(enabledChain(i.enabled_stages));

    const row: Record<string, unknown> = {
      [COL_INSTANCE_ID]: i.id,
      'Employee Code': i.employee?.employee_code ?? '',
      'Full Name': i.employee?.full_name ?? '',
      'Designation': i.employee?.designation ?? '',
      'Current Stage': i.overall_status,
      [TPL_CUR]: tpl?.name ?? '',
      [TPL_NEW]: '',
    };
    for (const w of WF_KEYS) row[w.col] = chain.has(w.role) ? 'Y' : 'N';
    for (const k of STAGE_WEIGHT_KEYS) row[WT_COL[k]] = numOrBlank(weights[k] ?? null);
    for (const s of sysCols) row[`SYS ${s.name}`] = (i.system_scores ?? {})[s.id] ?? '';
    for (const c of eligCols) {
      const v = (i.eligibility_inputs as Record<string, unknown> | null | undefined)?.[c.id];
      row[`ELG ${c.name}`] = v == null ? '' : v;
    }
    row[COL_REASON] = '';
    main.push(row);

    // Baseline mirrors every EDITABLE cell exactly as downloaded. TPL_NEW
    // baseline is the current template name so a re-typed identical name
    // is a no-op (matches today's BulkTemplateAssignmentDialog behaviour).
    const baseRow: Record<string, unknown> = { [COL_INSTANCE_ID]: i.id };
    baseRow[TPL_NEW] = tpl?.name ?? '';
    for (const w of WF_KEYS) baseRow[w.col] = chain.has(w.role) ? 'Y' : 'N';
    for (const k of STAGE_WEIGHT_KEYS) baseRow[WT_COL[k]] = numOrBlank(weights[k] ?? null);
    for (const s of sysCols) baseRow[`SYS ${s.name}`] = (i.system_scores ?? {})[s.id] ?? '';
    for (const c of eligCols) {
      const v = (i.eligibility_inputs as Record<string, unknown> | null | undefined)?.[c.id];
      baseRow[`ELG ${c.name}`] = v == null ? '' : v;
    }
    baseline.push(baseRow);
  }

  const wsMain = XLSX.utils.json_to_sheet(main, { header: mainHeaders });
  const wsBase = XLSX.utils.json_to_sheet(baseline);
  // Freeze header + first 5 read-only identity columns.
  (wsMain as unknown as { '!freeze'?: unknown })['!freeze'] = { xSplit: 5, ySplit: 1 };
  (wsBase as unknown as { '!hidden'?: boolean })['!hidden'] = true;

  const readme: Record<string, string>[] = [
    { Column: TPL_NEW, Meaning: 'Set a different template name, or CLEAR to remove an existing override. Eligible only when stage = not_started / pending_self.' },
    ...WF_KEYS.map((w) => ({
      Column: w.col,
      Meaning: `Y/N — include the ${w.role.replace('_', ' ')} stage in this employee's workflow. At least one stage must remain Y. Eligible only when stage = not_started / pending_self.`,
    })),
    ...STAGE_WEIGHT_KEYS.map((k) => ({
      Column: WT_COL[k],
      Meaning: `Final-score weight % for the ${k.replace('_', ' ')} bucket. If ANY WT column is edited, all WT columns are interpreted together and must sum to 100. Type CLEAR in WT Self % (others blank) to restore template default. Eligible only when stage = not_started / pending_self.`,
    })),
    ...sysCols.map((s) => ({ Column: `SYS ${s.name}`, Meaning: `Numeric — system score value for "${s.name}".` })),
    ...eligCols.map((c) => ({ Column: `ELG ${c.name}`, Meaning: `Eligibility input for "${c.name}".` })),
    { Column: COL_REASON, Meaning: 'Required when ANY editable cell on this row changes. Recorded in the audit log for every field touched on the row.' },
    { Column: COL_INSTANCE_ID, Meaning: 'Do not modify. Used by the upload to match rows safely even if you re-sort.' },
    { Column: SHEET_BASE, Meaning: 'Hidden sheet — do not delete. Holds the snapshot the upload diffs against. If missing, the upload is rejected.' },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsMain, SHEET_MAIN);
  XLSX.utils.book_append_sheet(wb, wsBase, SHEET_BASE);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(readme), SHEET_README);
  return wb;
}

export function downloadUnifiedWorkbook(args: BuildUnifiedArgs) {
  const wb = buildUnifiedWorkbook(args);
  XLSX.writeFile(wb, `annual-review-${args.cycle.review_year}-bulk-workbook.xlsx`);
}

// ---------------- Parser + Classifier ----------------

export type FieldEdit =
  | { kind: 'template'; targetId: string | null; label: string }
  | { kind: 'workflow'; enabledStages: AnnualReviewerRole[]; from: string; to: string }
  | { kind: 'weights'; weights: StageWeights | null; from: string; to: string }
  | { kind: 'system_score'; key: string; value: number; label: string }
  | { kind: 'eligibility'; key: string; value: string | number | boolean; label: string };

export interface RowChange {
  instanceId: string;
  employeeCode: string;
  employeeName: string;
  reason: string;
  edits: FieldEdit[];
  errors: string[];
}

export interface ParseResult {
  rows: RowChange[];
  /** Workbook-level fatal errors (e.g. baseline sheet missing). */
  fatal: string[];
}

function describeWeights(w: StageWeights | null): string {
  if (!w) return '(template default)';
  const parts = STAGE_WEIGHT_KEYS
    .map((k) => ({ k, v: Number(w[k] ?? 0) }))
    .filter((x) => x.v > 0)
    .map((x) => `${k(x.k)} ${x.v}`);
  return parts.join(' · ') || '—';
  function k(s: string) { return s.replace('_', ' '); }
}

export async function parseUnifiedWorkbook(
  file: File,
  instances: svc.InstanceWithEmployee[],
  templates: AnnualReviewTemplate[],
  systemTemplate: AnnualReviewTemplate | null,
): Promise<ParseResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf);
  if (!wb.SheetNames.includes(SHEET_MAIN)) {
    return { rows: [], fatal: [`Missing sheet "${SHEET_MAIN}". Download a fresh workbook.`] };
  }
  if (!wb.SheetNames.includes(SHEET_BASE)) {
    return { rows: [], fatal: [`Hidden sheet "${SHEET_BASE}" was removed. Upload rejected — please re-download the workbook to preserve the diff baseline.`] };
  }

  const mainRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[SHEET_MAIN], { defval: '' });
  const baseRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[SHEET_BASE], { defval: '' });

  const baseByInst = new Map<string, Record<string, unknown>>();
  for (const r of baseRows) {
    const id = strCell(r[COL_INSTANCE_ID]);
    if (id) baseByInst.set(id, r);
  }
  const instById = new Map(instances.map((i) => [i.id, i]));
  const tplByName = new Map<string, AnnualReviewTemplate>();
  for (const t of templates) if (t.is_active) tplByName.set(t.name.trim().toLowerCase(), t);
  const tplById = new Map(templates.map((t) => [t.id, t]));
  const sysCols = systemTemplate?.sections.system_scores ?? [];
  const eligCols = systemTemplate?.sections.eligibility_criteria ?? [];

  const out: RowChange[] = [];

  for (const row of mainRows) {
    const instanceId = strCell(row[COL_INSTANCE_ID]);
    if (!instanceId) continue;
    const inst = instById.get(instanceId);
    const base = baseByInst.get(instanceId);
    const employeeCode = strCell(row['Employee Code']);
    const employeeName = strCell(row['Full Name']);
    const reason = strCell(row[COL_REASON]);
    const errors: string[] = [];
    const edits: FieldEdit[] = [];

    if (!inst) { errors.push('Instance not in this cycle (was it deleted?).'); }
    if (!base) { errors.push('Baseline row missing — re-download workbook.'); }

    const eligibleForStructural =
      inst?.overall_status === 'not_started' || inst?.overall_status === 'pending_self';

    // --- Template ---
    if (inst && base) {
      const tplNew = strCell(row[TPL_NEW]);
      const tplBase = strCell(base[TPL_NEW]);
      if (tplNew && tplNew !== tplBase) {
        if (!eligibleForStructural) {
          errors.push(`Template change rejected — stage is ${inst.overall_status}.`);
        } else if (tplNew.toUpperCase() === 'CLEAR') {
          if (!inst.template_override_id) {
            // no-op
          } else {
            edits.push({ kind: 'template', targetId: null, label: `clear → ${tplById.get(inst.template_id)?.name ?? '—'}` });
          }
        } else {
          const tpl = tplByName.get(tplNew.toLowerCase());
          if (!tpl) errors.push(`Unknown template "${tplNew}".`);
          else edits.push({ kind: 'template', targetId: tpl.id, label: `${tplBase || '—'} → ${tpl.name}` });
        }
      }
    }

    // --- Workflow Y/N ---
    if (inst && base) {
      let wfChanged = false;
      const newChain: AnnualReviewerRole[] = [];
      const fromChain: AnnualReviewerRole[] = [];
      for (const w of WF_KEYS) {
        const cur = parseYN(row[w.col]);
        const baseFlag = parseYN(base[w.col]);
        if (baseFlag) fromChain.push(w.role);
        const effective = cur == null ? baseFlag : cur;
        if (cur != null && cur !== baseFlag) wfChanged = true;
        if (effective) newChain.push(w.role);
      }
      if (wfChanged) {
        if (!eligibleForStructural) {
          errors.push(`Workflow change rejected — stage is ${inst.overall_status}.`);
        } else if (newChain.length === 0) {
          errors.push('Workflow change rejected — at least one stage must remain Y.');
        } else {
          edits.push({
            kind: 'workflow', enabledStages: newChain,
            from: fromChain.join('→') || '—', to: newChain.join('→'),
          });
        }
      }
    }

    // --- Stage weights ---
    if (inst && base) {
      let weightTouched = false;
      let clearRequested = false;
      const next: StageWeights = {};
      for (const k of STAGE_WEIGHT_KEYS) {
        const cellRaw = strCell(row[WT_COL[k]]);
        const baseRaw = strCell(base[WT_COL[k]]);
        if (k === 'self' && cellRaw.toUpperCase() === 'CLEAR') {
          clearRequested = true; weightTouched = true; continue;
        }
        if (cellRaw !== baseRaw) weightTouched = true;
        if (cellRaw === '') continue;
        const n = Number(cellRaw);
        if (!Number.isFinite(n) || n < 0) {
          errors.push(`Weight cell ${WT_COL[k]} must be a non-negative number.`);
          continue;
        }
        if (n > 0) next[k] = n;
      }
      if (weightTouched) {
        if (!eligibleForStructural) {
          errors.push(`Stage-weights change rejected — stage is ${inst.overall_status}.`);
        } else if (clearRequested) {
          if (!inst.stage_weights_override) {
            // no-op
          } else {
            edits.push({ kind: 'weights', weights: null, from: 'override', to: 'template default' });
          }
        } else if (!isValidStageWeights(next)) {
          errors.push('Stage weights must sum to exactly 100 (±0.01).');
        } else {
          edits.push({
            kind: 'weights', weights: next,
            from: describeWeights(inst.stage_weights_override as StageWeights | null),
            to: describeWeights(next),
          });
        }
      }
    }

    // --- System scores ---
    if (inst && base) {
      for (const s of sysCols) {
        const col = `SYS ${s.name}`;
        const cur = strCell(row[col]);
        const baseV = strCell(base[col]);
        if (cur === baseV) continue;
        if (cur === '') continue; // blank = no change
        const n = Number(cur);
        if (!Number.isFinite(n)) { errors.push(`${col} must be numeric.`); continue; }
        edits.push({ kind: 'system_score', key: s.id, value: n, label: `${s.name}: ${baseV || '—'} → ${n}` });
      }
      for (const c of eligCols) {
        const col = `ELG ${c.name}`;
        const cur = strCell(row[col]);
        const baseV = strCell(base[col]);
        if (cur === baseV) continue;
        if (cur === '') continue;
        edits.push({ kind: 'eligibility', key: c.id, value: cur, label: `${c.name}: ${baseV || '—'} → ${cur}` });
      }
    }

    if (edits.length === 0 && errors.length === 0) continue; // truly unchanged → omit
    if (edits.length > 0 && reason.length < 3) {
      errors.push('Reason missing (min 3 characters).');
    }

    out.push({ instanceId, employeeCode, employeeName, reason, edits, errors });
  }

  return { rows: out, fatal: [] };
}

// ---------------- Apply router ----------------

export interface ApplyResult {
  applied: number;
  failed: number;
  rowErrors: { employeeCode: string; error: string }[];
}

export async function applyUnifiedChanges(
  rows: RowChange[],
  instancesById: Map<string, svc.InstanceWithEmployee>,
  onProgress?: (done: number, total: number) => void,
): Promise<ApplyResult> {
  const eligible = rows.filter((r) => r.edits.length > 0 && r.errors.length === 0);
  // Each row may need 1..N RPC calls. Surface progress at the row level for simplicity.
  let done = 0;
  const result: ApplyResult = { applied: 0, failed: 0, rowErrors: [] };

  for (const r of eligible) {
    const inst = instancesById.get(r.instanceId);
    // Mutable copies so multi-edit rows accumulate updates across cells.
    let sysScores: Record<string, number> = { ...(inst?.system_scores ?? {}) };
    let eligInputs: Record<string, string | number | boolean> = {
      ...((inst?.eligibility_inputs as Record<string, string | number | boolean>) ?? {}),
    };
    let sysDirty = false;
    let eligDirty = false;
    try {
      for (const e of r.edits) {
        switch (e.kind) {
          case 'template':
            await svc.setTemplateOverride({ instanceId: r.instanceId, templateId: e.targetId, reason: r.reason });
            break;
          case 'workflow':
            await svc.setEnabledStages({ instanceId: r.instanceId, enabledStages: e.enabledStages, reason: r.reason });
            break;
          case 'weights':
            await svc.setInstanceStageWeightsOverride({
              instanceId: r.instanceId,
              weights: e.weights as Record<string, number> | null,
              reason: r.reason,
            });
            break;
          case 'system_score':
            sysScores[e.key] = e.value; sysDirty = true; break;
          case 'eligibility':
            eligInputs[e.key] = e.value; eligDirty = true; break;
        }
      }
      if (sysDirty || eligDirty) {
        const patch: Record<string, unknown> = {};
        if (sysDirty) patch.system_scores = sysScores;
        if (eligDirty) patch.eligibility_inputs = eligInputs;
        await svc.updateInstance(r.instanceId, patch as Partial<svc.InstanceWithEmployee>);
      }
      result.applied++;
    } catch (err) {
      result.failed++;
      result.rowErrors.push({ employeeCode: r.employeeCode, error: (err as Error).message });
    }
    done++;
    onProgress?.(done, eligible.length);
  }

  return result;
}