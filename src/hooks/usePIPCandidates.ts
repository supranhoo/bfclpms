/**
 * ADR-207 / POLICY §PIP-TRIGGER-SUGGESTIONS
 *
 * Surfaces employees who meet an objective PIP trigger. Advisory only — the
 * hook never writes. Data is fetched lazily (`enabled`) because the monthly
 * trend RPC is a full-org aggregate.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useMonthlyTrend, buildMonthRange, type TrendEmployee } from '@/hooks/useMonthlyTrend';
import { getPipThreshold } from '@/lib/pmsSettings';
import { getPipPolicySettings, DEFAULT_PIP_POLICY } from '@/lib/pip/pipPolicySettings';
import {
  evaluateMonthlyTrigger,
  evaluateAnnualTrigger,
  resolveTriggerReason,
  classifyCandidate,
  POLICY_PIP_RATING,
  type CandidateState,
  type ExistingPipLike,
  type MonthlyTriggerResult,
} from '@/lib/pip/pipTriggerRules';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export interface PIPCandidate {
  employeeId: string;
  fullName: string;
  employeeCode: string;
  designation: string;
  departmentName: string;
  businessUnitId: string | null;
  businessUnitName: string;
  reportingManagerName: string | null;
  monthly: MonthlyTriggerResult;
  annualRating: number | null;
  triggers: ('monthly_trend' | 'annual_rating')[];
  reason: string;
  state: CandidateState;
  stateNote?: string;
  existingPipId?: string;
}

export interface UsePIPCandidatesOptions {
  /** Number of trailing months to evaluate (policy default: 3). */
  windowMonths: number;
  enabled: boolean;
  /** Reference "today" — injectable for tests. */
  today?: Date;
  /**
   * Optional anchor: the LAST month the window covers. Monthly KRA review can
   * lag by up to two months, so admins may need to evaluate a window that ends
   * on an older, fully-reviewed month. Defaults to the previous complete month.
   */
  anchor?: PipWindowAnchor;
}

export interface PipWindowAnchor {
  month: string;
  year: number;
}

/**
 * `windowMonths` complete months ending at `anchor` (inclusive). When no anchor
 * is supplied the window ends with the previous calendar month.
 */
export function trailingWindow(windowMonths: number, today: Date, anchor?: PipWindowAnchor) {
  const anchorIdx = anchor ? MONTHS.indexOf(anchor.month) : -1;
  const end = anchor && anchorIdx >= 0
    ? new Date(anchor.year, anchorIdx, 1)
    : new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const start = new Date(end.getFullYear(), end.getMonth() - (windowMonths - 1), 1);
  return {
    fromMonth: MONTHS[start.getMonth()],
    fromYear: start.getFullYear(),
    toMonth: MONTHS[end.getMonth()],
    toYear: end.getFullYear(),
  };
}

export function usePIPCandidates({ windowMonths, enabled, today, anchor }: UsePIPCandidatesOptions) {
  const now = today ?? new Date();
  const range = useMemo(
    () => trailingWindow(windowMonths, now, anchor),
    [windowMonths, now.getFullYear(), now.getMonth(), anchor?.month, anchor?.year],
  );

  const thresholdQ = useQuery({
    queryKey: ['pip-threshold'],
    queryFn: getPipThreshold,
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  const policyQ = useQuery({
    queryKey: ['pip-policy-settings'],
    queryFn: getPipPolicySettings,
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  const trendQ = useMonthlyTrend({ ...range, includeInactive: false, enabled });

  // Live / recent plans drive suppression (POLICY §15.7 / §15.12).
  const pipsQ = useQuery({
    queryKey: ['pip-suppression-set'],
    enabled,
    queryFn: async (): Promise<ExistingPipLike[]> => {
      const { data, error } = await supabase
        .from('performance_improvement_plans')
        .select('id, employee_id, status, end_date, extended_end_date, monitoring_until')
        .order('created_at', { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as unknown as ExistingPipLike[];
    },
  });

  // Annual trigger (POLICY §15.3). `annual_review_instances.final_rating` is a
  // descriptor label ("Poor" / "Average" / ...), so the comparable number comes
  // from `total_score`, which ADR-187 guarantees is on a 0..100 scale. It is
  // rebased to the 5-point rating scale the policy threshold is expressed in.
  const annualQ = useQuery({
    queryKey: ['pip-annual-ratings'],
    enabled,
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase
        .from('annual_review_instances')
        .select('employee_id, total_score, updated_at')
        .not('total_score', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(5000);
      if (error) throw error;
      const out: Record<string, number> = {};
      for (const row of (data ?? []) as unknown as { employee_id: string; total_score: number | string | null }[]) {
        if (row.total_score == null) continue;
        const v = Number(row.total_score) / 20; // 0..100 → 0..5
        if (!Number.isFinite(v)) continue;
        if (out[row.employee_id] == null) out[row.employee_id] = v;
      }
      return out;
    },
  });

  const months = useMemo(
    () => buildMonthRange(range.fromMonth, range.fromYear, range.toMonth, range.toYear),
    [range],
  );
  const monthKeys = useMemo(() => months.map(m => m.key), [months]);
  const monthLabels = useMemo(
    () => Object.fromEntries(months.map(m => [m.key, m.label])),
    [months],
  );

  const threshold = thresholdQ.data ?? null;
  const policy = policyQ.data ?? DEFAULT_PIP_POLICY;

  const candidates = useMemo<PIPCandidate[]>(() => {
    if (threshold == null) return [];
    const employees = (trendQ.data?.employees ?? []) as TrendEmployee[];
    const annualMap = annualQ.data ?? {};
    const existing = pipsQ.data ?? [];

    const out: PIPCandidate[] = [];
    for (const emp of employees) {
      const monthly = evaluateMonthlyTrigger(
        { monthlyScores: emp.monthlyFinalScores ?? emp.monthlyScores },
        monthKeys,
        threshold,
      );
      const annual = evaluateAnnualTrigger(annualMap[emp.id] ?? null, threshold);
      if (!monthly.qualifies && !annual.qualifies) continue;

      const classification = classifyCandidate(emp.id, existing, policy.monitorMonths, now);
      out.push({
        employeeId: emp.id,
        fullName: emp.fullName,
        employeeCode: emp.employeeCode,
        designation: emp.designation,
        departmentName: emp.departmentName,
        businessUnitId: emp.businessUnitId,
        businessUnitName: emp.businessUnitName,
        reportingManagerName: emp.reportingManagerName,
        monthly,
        annualRating: annual.rating,
        triggers: [
          ...(monthly.qualifies ? (['monthly_trend'] as const) : []),
          ...(annual.qualifies ? (['annual_rating'] as const) : []),
        ],
        reason: resolveTriggerReason({ threshold, monthly, annual, monthLabels }),
        state: classification.state,
        stateNote: classification.note,
        existingPipId: classification.pipId,
      });
    }
    return out.sort((a, b) => (a.monthly.worstScore ?? 99) - (b.monthly.worstScore ?? 99));
  }, [threshold, trendQ.data, annualQ.data, pipsQ.data, monthKeys, monthLabels, policy.monitorMonths]);

  return {
    candidates,
    months,
    monthKeys,
    threshold,
    policy,
    thresholdMatchesPolicy: threshold != null && Math.abs(threshold - POLICY_PIP_RATING) < 0.001,
    isLoading: enabled && (thresholdQ.isLoading || trendQ.isLoading || pipsQ.isLoading || annualQ.isLoading),
    error: (thresholdQ.error || trendQ.error || pipsQ.error || annualQ.error) as Error | null,
    refetch: () => { void trendQ.refetch(); void pipsQ.refetch(); void annualQ.refetch(); },
  };
}