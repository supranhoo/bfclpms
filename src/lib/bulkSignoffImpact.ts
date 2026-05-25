/**
 * Bulk Sign-off Impact — Dashboard-parity rollup (POLICY §111.7.a, v2.66.13.9)
 * --------------------------------------------------------------------------
 * Given the selected cells + their per-employee KPI rule + the FULL loaded
 * snapshot (so we can compute current totals), produce:
 *   • per-cell row (Wt% · resolved score · source · weighted impact)
 *   • per-employee rollup (cells in batch · current weighted score → projected)
 *
 * Math mirrors `calculateOverallScore` (Σ rating × wt / Σ wt). `is_na` rows
 * and rows with no score are excluded from current totals.
 */

import {
  resolveCarriedScore, resolveWithInputs,
  type KpiRule, type SignoffStage, type CarriedSource, type SubmissionScores,
  type CellInputs,
} from './carriedScoreResolver';

export interface SnapshotCell {
  submission_id: string | null;
  kpi_id: string;
  employee_id: string;
  employee_name: string;
  kpi_name: string;
  kra_name: string;
  weightage: number | null;
  is_na: boolean | null;
  self_score: number | null;
  manager_score: number | null;
  skip_level_score: number | null;
  hr_pms_score: number | null;
  auditor_score: number | null;
  management_score: number | null;
  final_score: number | null;
}

export interface CellPreview {
  submission_id: string;
  employee_id: string;
  employee_name: string;
  kpi_name: string;
  weightage: number;
  score: number | null;
  source: CarriedSource;
  /** weightage × score / 100 — scoring impact on overall weighted total. */
  weightedImpact: number | null;
}

export interface EmployeeRollup {
  employee_id: string;
  employee_name: string;
  cellsInBatch: number;
  batchWeightSum: number;
  currentOverall: number; // 0-5 scale, matches Dashboard
  projectedOverall: number; // after this sign-off
  delta: number;
  skippedInBatch: number;
}

export interface ImpactSummary {
  cells: CellPreview[];
  perEmployee: EmployeeRollup[];
  totals: {
    cellCount: number;
    employeeCount: number;
    computedCount: number;
    skippedCount: number;
    overrideCount: number;
    requiredUnfilled: number;
    weightedDelta: number;
  };
}

function bestScore(r: SnapshotCell): number | null {
  return r.final_score
    ?? r.management_score
    ?? r.auditor_score
    ?? r.hr_pms_score
    ?? r.skip_level_score
    ?? r.manager_score
    ?? r.self_score
    ?? null;
}

/** Stage column for the "score after sign-off" projection. */
function stageScoreOf(stage: SignoffStage, r: SnapshotCell): number | null {
  if (stage === 'manager') return r.manager_score;
  if (stage === 'skip_level') return r.skip_level_score;
  if (stage === 'hr_pms') return r.hr_pms_score;
  return r.auditor_score;
}

export interface BuildImpactInput {
  stage: SignoffStage;
  /** All cells in the currently loaded snapshot (per-employee scope). */
  loadedRows: SnapshotCell[];
  /** subset of loadedRows the reviewer selected for sign-off. */
  selectedSubmissionIds: Set<string>;
  /** kpi_id → per-employee rule (already batch-fetched). */
  ruleByKpiId: Map<string, KpiRule>;
  /** submission_id → live achieved_value (already batch-fetched). */
  achievedBySubmissionId: Map<string, number | string | null>;
  /** submission_id → reviewer-entered overrides (Achieved + Manual). */
  inputsBySubmissionId?: Map<string, CellInputs>;
  /** Admin override toggle — unlocks editing on every row + flips source. */
  isOverride?: boolean;
}

export function buildBulkSignoffImpact(input: BuildImpactInput): ImpactSummary {
  const {
    stage, loadedRows, selectedSubmissionIds, ruleByKpiId, achievedBySubmissionId,
    inputsBySubmissionId, isOverride = false,
  } = input;

  // ── 1. Resolve every selected cell ────────────────────────────────────
  const cellById = new Map<string, CellPreview>();
  for (const r of loadedRows) {
    if (!r.submission_id || !selectedSubmissionIds.has(r.submission_id)) continue;
    const rule = ruleByKpiId.get(r.kpi_id);
    if (!rule) continue;
    const sub: SubmissionScores = {
      self_score: r.self_score,
      manager_score: r.manager_score,
      skip_level_score: r.skip_level_score,
      hr_pms_score: r.hr_pms_score,
      achieved_value: achievedBySubmissionId.get(r.submission_id) ?? null,
      is_na: r.is_na,
    };
    const inputs = inputsBySubmissionId?.get(r.submission_id);
    const { score, source } = (inputs || isOverride)
      ? resolveWithInputs({ stage, submission: sub, kpi: rule }, inputs, isOverride)
      : resolveCarriedScore({ stage, submission: sub, kpi: rule });
    const weightage = Number(r.weightage ?? rule.weightage ?? 0) || 0;
    cellById.set(r.submission_id, {
      submission_id: r.submission_id,
      employee_id: r.employee_id,
      employee_name: r.employee_name,
      kpi_name: r.kpi_name,
      weightage,
      score,
      source,
      // Rating-points × wt / 100 — matches matrix cell formula
      // (`bestScore * weightage / 100`), so totals reconcile with the grid.
      weightedImpact: score == null ? null : Math.round((score * weightage) / 100 * 100) / 100,
    });
  }

  // ── 2. Per-employee rollup (Dashboard math) ───────────────────────────
  const empMap = new Map<string, {
    employee_id: string;
    employee_name: string;
    cellsInBatch: number;
    batchWeightSum: number;
    skippedInBatch: number;
    currentWeightedSum: number;
    currentWeightSum: number;
    projectedWeightedSum: number;
    projectedWeightSum: number;
  }>();

  for (const r of loadedRows) {
    const eid = r.employee_id;
    if (!empMap.has(eid)) {
      empMap.set(eid, {
        employee_id: eid, employee_name: r.employee_name,
        cellsInBatch: 0, batchWeightSum: 0, skippedInBatch: 0,
        currentWeightedSum: 0, currentWeightSum: 0,
        projectedWeightedSum: 0, projectedWeightSum: 0,
      });
    }
    const agg = empMap.get(eid)!;
    if (r.is_na) continue; // excluded from weighted totals (Core memory)
    const wt = Number(r.weightage ?? 0) || 0;
    if (wt === 0) continue;

    // Current score for this row (best available).
    const cur = bestScore(r);
    if (cur != null) {
      agg.currentWeightedSum += cur * wt;
      agg.currentWeightSum += wt;
    }

    // Projected: if this row is in the batch, replace stage score with resolved.
    const inBatch = r.submission_id ? cellById.get(r.submission_id) : undefined;
    let projectedRowScore: number | null = cur;
    if (inBatch) {
      agg.cellsInBatch += 1;
      agg.batchWeightSum += wt;
      if (inBatch.source === 'none') {
        agg.skippedInBatch += 1;
      } else {
        // Replace stage column with resolved; recompute best after replacement.
        const stageHadScore = stageScoreOf(stage, r) != null;
        if (!stageHadScore) {
          // Stage being newly stamped — the resolved score becomes the best
          // available (terminal stages above it are still NULL by construction).
          projectedRowScore = inBatch.score;
        }
      }
    }
    if (projectedRowScore != null) {
      agg.projectedWeightedSum += projectedRowScore * wt;
      agg.projectedWeightSum += wt;
    }
  }

  const perEmployee: EmployeeRollup[] = Array.from(empMap.values())
    .filter(e => e.cellsInBatch > 0)
    .map(e => {
      const cur = e.currentWeightSum > 0 ? e.currentWeightedSum / e.currentWeightSum : 0;
      const proj = e.projectedWeightSum > 0 ? e.projectedWeightedSum / e.projectedWeightSum : 0;
      return {
        employee_id: e.employee_id,
        employee_name: e.employee_name,
        cellsInBatch: e.cellsInBatch,
        batchWeightSum: e.batchWeightSum,
        currentOverall: Math.round(cur * 100) / 100,
        projectedOverall: Math.round(proj * 100) / 100,
        delta: Math.round((proj - cur) * 100) / 100,
        skippedInBatch: e.skippedInBatch,
      };
    })
    .sort((a, b) => a.employee_name.localeCompare(b.employee_name));

  const cells = Array.from(cellById.values()).sort(
    (a, b) => a.employee_name.localeCompare(b.employee_name) || a.kpi_name.localeCompare(b.kpi_name),
  );

  const computedCount = cells.filter(c => c.source === 'computed').length;
  const skippedCount = cells.filter(c => c.source === 'none').length;
  const overrideCount = cells.filter(c => c.source === 'override' || c.source === 'manual').length;
  const requiredUnfilled = cells.filter(c => c.source === 'none' || (c.source === 'override' && c.score == null)).length;
  const weightedDelta = perEmployee.reduce((s, e) => s + e.delta, 0);

  return {
    cells,
    perEmployee,
    totals: {
      cellCount: cells.length,
      employeeCount: perEmployee.length,
      computedCount,
      skippedCount,
      overrideCount,
      requiredUnfilled,
      weightedDelta: Math.round(weightedDelta * 100) / 100,
    },
  };
}
