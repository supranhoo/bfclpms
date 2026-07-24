import { supabase } from '@/integrations/supabase/client';
import { fetchAllRpcPaged } from '@/lib/fetchAll';

export interface ComprehensiveRow {
  instance_id: string;
  employee_id: string;
  employee_code: string | null;
  employee_name: string | null;
  designation: string | null;
  department_id: string | null;
  department_name: string | null;
  business_unit_id: string | null;
  business_unit_name: string | null;
  division_id: string | null;
  division_name: string | null;
  grade: string | null;
  doj: string | null;
  overall_status: string;
  is_excluded: boolean;
  excluded_reason: string | null;
  enabled_stages: unknown;
  self_score: number | null;
  manager_score: number | null;
  dept_head_score: number | null;
  bu_head_score: number | null;
  hr_score: number | null;
  management_score: number | null;
  total_score: number | null;
  final_rating: string | null;
  finalized_at: string | null;
  updated_at: string | null;
  days_pending: number | null;
  manager_name: string | null;
  dept_head_name: string | null;
  bu_head_name: string | null;
  hr_name: string | null;
  management_name: string | null;
  self_comment: string | null;
  manager_comment: string | null;
  dept_head_comment: string | null;
  bu_head_comment: string | null;
  hr_comment: string | null;
  management_comment: string | null;
  hr_stage_enabled: boolean | null;
  hr_response_exists: boolean | null;
  hr_response_submitted_at: string | null;
  manager_id: string | null;
  dept_head_id: string | null;
  bu_head_id: string | null;
  hr_id: string | null;
  management_id: string | null;
  cycle_default_stages: unknown;
}

export async function fetchComprehensiveReport(cycleId: string): Promise<ComprehensiveRow[]> {
  if (!cycleId) return [];
  // POLICY §125 / ADR-094 — PostgREST caps RPC responses at 1,000 rows.
  // Page via Range headers so the Comprehensive report shows the full roster.
  return await fetchAllRpcPaged<ComprehensiveRow>((from, to) =>
    (supabase as any)
      .rpc('get_annual_review_comprehensive_report', { p_cycle_id: cycleId })
      .range(from, to),
  );
}

export const STAGE_LABEL: Record<string, string> = {
  not_started: 'Not started',
  pending_self: 'Self',
  pending_manager: 'HOD / Manager',
  pending_skip: 'Skip Manager',
  pending_dept: 'Dept Head',
  pending_bu: 'BU Head',
  pending_hr: 'HR',
  completed: 'Completed',
  excluded: 'Excluded',
};

export function pendingWith(status: string): string {
  return STAGE_LABEL[status] ?? status;
}

export function eligibilityLabel(row: ComprehensiveRow): 'Eligible' | 'Excluded' {
  return row.is_excluded ? 'Excluded' : 'Eligible';
}

export function completionStatus(status: string): string {
  if (status === 'completed') return 'Completed';
  if (status === 'excluded') return 'Excluded';
  if (status === 'not_started' || status === 'pending_self') return 'Not started';
  return 'In progress';
}

export interface KpiSummary {
  total: number;
  eligible: number;
  excluded: number;
  pending_self: number;
  pending_hod: number;
  pending_bu: number;
  pending_hr: number;
  in_progress: number;
  completed: number;
  avg_final: number | null;
}

export function summarize(rows: ComprehensiveRow[]): KpiSummary {
  const s: KpiSummary = {
    total: rows.length,
    eligible: 0, excluded: 0,
    pending_self: 0, pending_hod: 0, pending_bu: 0, pending_hr: 0,
    in_progress: 0, completed: 0, avg_final: null,
  };
  let sum = 0, n = 0;
  for (const r of rows) {
    if (r.is_excluded) s.excluded++; else s.eligible++;
    switch (r.overall_status) {
      case 'pending_self': s.pending_self++; break;
      case 'pending_manager':
      case 'pending_skip':
      case 'pending_dept': s.pending_hod++; break;
      case 'pending_bu': s.pending_bu++; break;
      case 'pending_hr': s.pending_hr++; break;
      case 'completed': s.completed++; break;
    }
    if (!['completed','excluded','pending_self','not_started'].includes(r.overall_status)) s.in_progress++;
    if (r.total_score != null && !r.is_excluded) { sum += Number(r.total_score); n++; }
  }
  s.avg_final = n > 0 ? sum / n : null;
  return s;
}

export interface GroupSummary {
  key: string;
  name: string;
  total: number;
  eligible: number;
  excluded: number;
  self_done: number;
  hod_done: number;
  bu_done: number;
  hr_done: number;
  completed: number;
  submission_pct: number;
  avg_final: number | null;
}

export function groupBy(
  rows: ComprehensiveRow[],
  keyFn: (r: ComprehensiveRow) => { key: string; name: string },
): GroupSummary[] {
  const map = new Map<string, GroupSummary & { _sum: number; _n: number }>();
  for (const r of rows) {
    const { key, name } = keyFn(r);
    let g = map.get(key);
    if (!g) {
      g = { key, name, total: 0, eligible: 0, excluded: 0, self_done: 0, hod_done: 0, bu_done: 0, hr_done: 0, completed: 0, submission_pct: 0, avg_final: null, _sum: 0, _n: 0 };
      map.set(key, g);
    }
    g.total++;
    if (r.is_excluded) g.excluded++; else g.eligible++;
    // "Done" means that stage produced a submitted score (weighted_score present).
    if (r.self_score != null) g.self_done++;
    if (r.manager_score != null || r.dept_head_score != null) g.hod_done++;
    if (r.bu_head_score != null) g.bu_done++;
    if (r.hr_score != null) g.hr_done++;
    if (r.overall_status === 'completed') g.completed++;
    if (r.total_score != null && !r.is_excluded) { g._sum += Number(r.total_score); g._n++; }
  }
  const out: GroupSummary[] = [];
  for (const g of map.values()) {
    g.submission_pct = g.eligible > 0 ? Math.round((g.self_done / g.eligible) * 1000) / 10 : 0;
    g.avg_final = g._n > 0 ? Math.round((g._sum / g._n) * 100) / 100 : null;
    out.push(g);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function ratingDistribution(rows: ComprehensiveRow[]): Array<{ rating: string; count: number; pct: number }> {
  const map = new Map<string, number>();
  let denom = 0;
  for (const r of rows) {
    if (r.is_excluded) continue;
    const key = r.final_rating?.trim() || 'Unrated';
    map.set(key, (map.get(key) ?? 0) + 1);
    denom++;
  }
  return Array.from(map.entries())
    .map(([rating, count]) => ({ rating, count, pct: denom > 0 ? Math.round((count / denom) * 1000) / 10 : 0 }))
    .sort((a, b) => b.count - a.count);
}

// ---------- HR RCA diagnostics ----------

export type HrRootCause =
  | 'OK'
  | 'HR Review Not Started'
  | 'HR Review Pending'
  | 'HR Review Not Submitted'
  | 'HR Data Not Mapped'
  | 'Data Migration Issue'
  | 'Report Configuration Issue';

export interface HrDiagnosis {
  hr_data_available: boolean;
  hr_data_visible: boolean;
  root_cause: HrRootCause;
  evidence: string;
  impact: string;
  recommended_fix: string;
}

function stagesArray(v: unknown): string[] {
  if (Array.isArray(v)) return v as string[];
  if (v && typeof v === 'object') return Object.keys(v as object);
  return [];
}

export function diagnoseHr(row: ComprehensiveRow): HrDiagnosis {
  const hrExists = !!row.hr_response_exists;
  const hrVisible = hrExists && row.hr_score != null;

  const instStages = stagesArray(row.enabled_stages);
  const cycleStages = stagesArray(row.cycle_default_stages);
  const hrEnabled = row.hr_stage_enabled ?? (instStages.includes('hr') || cycleStages.includes('hr'));

  let rootCause: HrRootCause = 'OK';
  let evidence = '';

  if (hrVisible) {
    rootCause = 'OK';
    evidence = `HR score present (${row.hr_score}); submitted_at=${row.hr_response_submitted_at ?? 'null'}`;
  } else if (!hrEnabled) {
    rootCause = 'HR Review Not Started';
    evidence = `enabled_stages=${JSON.stringify(instStages.length ? instStages : cycleStages)}; hr stage not enabled for this cycle/instance`;
  } else if (!row.hr_id) {
    rootCause = 'HR Data Not Mapped';
    evidence = `instance.hr_id=null; enabled_stages includes hr`;
  } else if (!hrExists && row.overall_status === 'pending_hr') {
    rootCause = 'HR Review Pending';
    evidence = `overall_status=pending_hr; no annual_review_responses row for reviewer_role=hr; hr_id=${row.hr_id}`;
  } else if (!hrExists) {
    rootCause = 'HR Review Not Started';
    evidence = `overall_status=${row.overall_status}; workflow not yet at HR; hr_id=${row.hr_id}`;
  } else if (hrExists && !row.hr_response_submitted_at) {
    rootCause = 'HR Review Not Submitted';
    evidence = `response row exists but submitted_at is null; weighted_score=${row.hr_score ?? 'null'}`;
  } else if (hrExists && row.hr_score == null) {
    rootCause = 'Data Migration Issue';
    evidence = `response row exists and submitted_at=${row.hr_response_submitted_at}, but weighted_score is null (backfill needed)`;
  } else {
    rootCause = 'Report Configuration Issue';
    evidence = `hrExists=${hrExists}, hrScore=${row.hr_score}, submittedAt=${row.hr_response_submitted_at}`;
  }

  const impactMap: Record<HrRootCause, string> = {
    'OK': 'None — HR score is present and visible.',
    'HR Review Not Started': 'Final score cannot include HR weight; workflow has not reached HR.',
    'HR Review Pending': 'Final rating blocked until HR submits.',
    'HR Review Not Submitted': 'Draft only — score not counted; final rating blocked.',
    'HR Data Not Mapped': 'HR reviewer unassigned; instance cannot advance to HR.',
    'Data Migration Issue': 'Score column blank despite submission — report/UI shows dash.',
    'Report Configuration Issue': 'Unexpected state; UI fallback triggered.',
  };
  const fixMap: Record<HrRootCause, string> = {
    'OK': 'No action required.',
    'HR Review Not Started': 'Advance workflow through prior stages; verify HR stage is enabled on the cycle.',
    'HR Review Pending': 'Notify HR reviewer to complete the pending review.',
    'HR Review Not Submitted': 'HR reviewer should submit their draft.',
    'HR Data Not Mapped': 'Assign HR reviewer on the instance (Admin → Annual Review → Reviewer mapping).',
    'Data Migration Issue': 'Run rescore/backfill RPC (annual_review_rescore) for this instance.',
    'Report Configuration Issue': 'Escalate — check report resolver for column mapping.',
  };

  return {
    hr_data_available: hrExists,
    hr_data_visible: hrVisible,
    root_cause: rootCause,
    evidence,
    impact: impactMap[rootCause],
    recommended_fix: fixMap[rootCause],
  };
}

export function stageRatingFromScore(score: number | null): string {
  if (score == null) return '';
  if (score >= 90) return 'Outstanding';
  if (score >= 80) return 'Exceeds Expectations';
  if (score >= 70) return 'Meets Expectations';
  if (score >= 60) return 'Needs Improvement';
  return 'Below Expectations';
}