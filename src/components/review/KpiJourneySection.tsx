import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ReviewStageCard, StageStatus } from './ReviewStageCard';
import { KPI, ReviewSubmission, KpiQuery } from '@/hooks/useKpis';
import { User, Briefcase, Shield, MessageSquare, History, UserCheck, ClipboardCheck, AlertTriangle, Download, ChevronDown, CalendarClock, FileCheck, Info, GitMerge } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { getVisibleJourneyStages, DEFAULT_WORKFLOW_STAGES } from '@/lib/workflowEngine';
import { calculateRating, RatingThresholds } from '@/lib/ratingCalculation';
import { UomType } from '@/lib/qualitativeUom';
import { exportReviewTimelinePdf, ReviewTimelinePdfData } from '@/lib/pdfExport';
import { statusLabels } from '@/lib/reviewConstants';
import { format } from 'date-fns';
import { isComplianceKpi, useComplianceSubFactors } from '@/hooks/useComplianceSubFactors';
import { isKpiLockedForPeriod, getActiveMonthForCycle } from '@/lib/frequencyUtils';
import { useFrequencyConfig } from '@/hooks/useFrequencyConfig';
import { useCanonicalResolver } from '@/hooks/useCanonicalResolver';
import { signatureKey, nk } from '@/lib/canonicalGrouping';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function getPreviousPeriods(currentMonth: string, currentYear: number, count: number) {
  const idx = MONTHS.indexOf(currentMonth);
  if (idx === -1) return [];
  const result: { month: string; year: number }[] = [];
  for (let i = 1; i <= count; i++) {
    let mi = idx - i;
    let yr = currentYear;
    if (mi < 0) {
      mi += 12;
      yr -= 1;
    }
    result.push({ month: MONTHS[mi], year: yr });
  }
  return result;
}

function useEmployeeProfileForPdf(employeeId: string | undefined) {
  return useQuery({
    queryKey: ['employee-pdf-profile', employeeId],
    queryFn: async () => {
      if (!employeeId) return null;
      const { data: emp } = await supabase
        .from('profiles')
        .select('full_name, employee_code, reporting_manager_id')
        .eq('id', employeeId)
        .single();
      if (!emp) return null;
      let managerName: string | null = null;
      if (emp.reporting_manager_id) {
        const { data: mgr } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', emp.reporting_manager_id)
          .single();
        managerName = mgr?.full_name || null;
      }
      return {
        fullName: emp.full_name,
        employeeCode: emp.employee_code,
        managerName,
      };
    },
    enabled: !!employeeId,
    staleTime: 5 * 60 * 1000,
  });
}

type ViewLevel = 'employee' | 'manager' | 'auditor' | 'management' | 'skip_level' | 'hr_pms' | 'admin';
type JourneyStage = 'self' | 'manager' | 'skip_level' | 'hr_pms' | 'auditor' | 'management';

interface KpiJourneySectionProps {
  kpi: KPI;
  submission: ReviewSubmission | null;
  queries?: KpiQuery[];
  viewLevel: ViewLevel;
  onOpenQueryHistory?: () => void;
  workflowStages?: string[];
  employeeName?: string;
  employeeCode?: string;
  reportingManagerName?: string;
  orgAchievedValue?: number | null;
}

// Determine the status of each review stage based on KPI status and view level
function getStageStatus(
  stage: JourneyStage,
  kpiStatus: string,
  viewLevel: ViewLevel,
  workflowStages: string[] = DEFAULT_WORKFLOW_STAGES
): StageStatus {
  const statusOrder = workflowStages;
  const stageToStatus: Record<string, string> = {
    self: 'self_review',
    manager: 'manager_check',
    skip_level: 'skip_level_check',
    hr_pms: 'hr_pms_review',
    auditor: 'audit',
    management: 'management_review',
  };

  const stageStartStatus = stageToStatus[stage];
  const stageStartIndex = statusOrder.indexOf(stageStartStatus);
  const currentIndex = statusOrder.indexOf(kpiStatus);

  if (currentIndex > stageStartIndex) {
    return 'completed';
  }

  if (kpiStatus === stageStartStatus) {
    return 'current';
  }

  return 'pending';
}

// Get visible stages based on workflow
function getVisibleStagesForLevel(
  _viewLevel: ViewLevel,
  workflowStages: string[] = DEFAULT_WORKFLOW_STAGES
): JourneyStage[] {
  return getVisibleJourneyStages(workflowStages);
}

export function KpiJourneySection({
  kpi,
  submission,
  queries = [],
  viewLevel,
  onOpenQueryHistory,
  workflowStages,
  employeeName,
  employeeCode,
  reportingManagerName,
  orgAchievedValue,
}: KpiJourneySectionProps) {
  const { data: profileData } = useEmployeeProfileForPdf(kpi.employee_id);
  const effectiveStages = workflowStages || DEFAULT_WORKFLOW_STAGES;
  const kpiStatus = kpi.status || 'kra_set';
  const visibleStages = getVisibleStagesForLevel(viewLevel, effectiveStages);
  const globalIsNA = submission?.is_na || false;
  const [prevMonthsOpen, setPrevMonthsOpen] = useState(false);

  // Compliance sub-factors
  const isCompliance = isComplianceKpi(kpi.kra_name);
  const { data: complianceData } = useComplianceSubFactors(
    isCompliance ? kpi.employee_id : undefined,
    isCompliance ? kpi.category_id : undefined,
    isCompliance ? kpi.kra_name : undefined,
    isCompliance ? kpi.kpi_name : undefined,
    isCompliance ? kpi.review_period : undefined,
    isCompliance ? kpi.review_year : undefined,
  );

  // Terminal month status banner for non-terminal multi-month KPIs
  const { config: freqConfig } = useFrequencyConfig(kpi.frequency);
  const isLockedSibling = useMemo(
    () => isKpiLockedForPeriod(kpi.frequency, kpi.review_period || '', kpi.review_year || new Date().getFullYear(), kpi.frequency_cycle_start, freqConfig),
    [kpi.frequency, kpi.review_period, kpi.review_year, kpi.frequency_cycle_start, freqConfig]
  );
  const terminalMonth = useMemo(
    () => isLockedSibling ? getActiveMonthForCycle(kpi.frequency, kpi.review_period || '', kpi.review_year || new Date().getFullYear(), kpi.frequency_cycle_start, freqConfig) : null,
    [isLockedSibling, kpi.frequency, kpi.review_period, kpi.review_year, kpi.frequency_cycle_start, freqConfig]
  );

  const { data: terminalKpiData } = useQuery({
    queryKey: ['terminal-month-kpi', kpi.employee_id, kpi.kra_name, kpi.frequency, kpi.category_id, terminalMonth, kpi.review_year],
    queryFn: async () => {
      const { data: kpis, error } = await supabase
        .from('kpis')
        .select('id, status, review_period, kpi_name')
        .eq('employee_id', kpi.employee_id)
        .eq('kra_name', kpi.kra_name)
        .eq('frequency', kpi.frequency)
        .eq('category_id', kpi.category_id)
        .eq('review_period', terminalMonth!)
        .eq('review_year', kpi.review_year);
      if (error) throw error;
      if (!kpis || kpis.length === 0) return null;
      // If multiple matches, prefer the one with matching kpi_name prefix
      let termKpi = kpis[0];
      if (kpis.length > 1) {
        const prefix = (kpi.kpi_name || '').substring(0, 30).toLowerCase();
        const prefixMatch = kpis.find(k => (k.kpi_name || '').substring(0, 30).toLowerCase() === prefix);
        if (prefixMatch) termKpi = prefixMatch;
      }
      // Check if submission exists
      const { data: sub } = await supabase
        .from('review_submissions')
        .select('id, achieved_value, self_score')
        .eq('kpi_id', termKpi.id)
        .limit(1);
      const hasSubmission = sub && sub.length > 0 && (sub[0].achieved_value !== null || sub[0].self_score !== null);
      return { status: termKpi.status as string, hasSubmission: !!hasSubmission };
    },
    enabled: isLockedSibling && !!terminalMonth,
    staleTime: 2 * 60 * 1000,
  });

  // Compute previous 2 periods
  const prevPeriods = useMemo(
    () => getPreviousPeriods(kpi.review_period || '', kpi.review_year || new Date().getFullYear(), 2),
    [kpi.review_period, kpi.review_year]
  );

  // Phase 3b: Resolve current KPI's canonical definition so prev-month lookup
  // can also surface renamed variants of the same canonical KPI. If no
  // registry match exists (pre-May 2026 data, or unregistered KPI), the
  // resolver returns nothing and the lookup falls back to exact name match.
  const currentSignature = useMemo(
    () =>
      kpi.category_id && kpi.kra_name && kpi.kpi_name
        ? [{ category_id: kpi.category_id, kra_name: kpi.kra_name, kpi_name: kpi.kpi_name }]
        : [],
    [kpi.category_id, kpi.kra_name, kpi.kpi_name]
  );
  const { data: resolverMap } = useCanonicalResolver(currentSignature);
  const currentDefinitionId = resolverMap?.get(
    signatureKey({ category_id: kpi.category_id, kra_name: kpi.kra_name, kpi_name: kpi.kpi_name })
  )?.definition_id ?? null;

  // Fetch all variant (kra_name, kpi_name) pairs for this canonical definition
  // so the prev-month query can match renamed historical rows. Includes the
  // canonical pair itself plus every alias.
  const { data: variantPairs = [] } = useQuery<Array<{ kra_name: string; kpi_name: string }>>({
    queryKey: ['canonical-variants', currentDefinitionId],
    queryFn: async () => {
      if (!currentDefinitionId) return [];
      const [defRes, aliasRes] = await Promise.all([
        supabase
          .from('kpi_definitions')
          .select('canonical_kra_name, canonical_kpi_name')
          .eq('id', currentDefinitionId)
          .maybeSingle(),
        supabase
          .from('kpi_name_aliases')
          .select('variant_kra_name, variant_kpi_name')
          .eq('definition_id', currentDefinitionId),
      ]);
      const out: Array<{ kra_name: string; kpi_name: string }> = [];
      if (defRes.data) {
        out.push({
          kra_name: defRes.data.canonical_kra_name,
          kpi_name: defRes.data.canonical_kpi_name,
        });
      }
      for (const a of aliasRes.data ?? []) {
        out.push({ kra_name: a.variant_kra_name, kpi_name: a.variant_kpi_name });
      }
      return out;
    },
    enabled: !!currentDefinitionId,
    staleTime: 10 * 60 * 1000,
  });

  // Fetch previous months' matching KPIs + submissions
  const { data: prevMonthsData = [] } = useQuery({
    queryKey: ['prev-month-kpis', kpi.employee_id, kpi.kpi_name, kpi.kra_name, kpi.category_id, prevPeriods, variantPairs],
    queryFn: async () => {
      if (prevPeriods.length === 0) return [];
      const uniqueMonths = prevPeriods.map(p => p.month);
      const uniqueYears = [...new Set(prevPeriods.map(p => p.year))];

      // Build the set of (kra_name, kpi_name) pairs to match. When a canonical
      // definition is known, include all aliases; otherwise just the current
      // pair (preserves legacy exact-match behavior).
      const pairs: Array<{ kra_name: string; kpi_name: string }> =
        variantPairs.length > 0
          ? variantPairs
          : [{ kra_name: kpi.kra_name, kpi_name: kpi.kpi_name }];
      const kraNames = Array.from(new Set(pairs.map(p => p.kra_name)));
      const kpiNames = Array.from(new Set(pairs.map(p => p.kpi_name)));
      const pairKeys = new Set(pairs.map(p => `${nk(p.kra_name)}|${nk(p.kpi_name)}`));

      // Fetch matching KPIs (broad fetch by .in(); post-filter to exact pairs
      // to avoid Cartesian-product false positives like (kraA + kpiB)).
      const { data: kpis, error: kErr } = await supabase
        .from('kpis')
        .select('*')
        .eq('employee_id', kpi.employee_id)
        .eq('category_id', kpi.category_id)
        .in('kra_name', kraNames)
        .in('kpi_name', kpiNames)
        .in('review_period', uniqueMonths)
        .in('review_year', uniqueYears);
      if (kErr) throw kErr;
      if (!kpis || kpis.length === 0) return [];

      // Keep only rows whose (kra_name, kpi_name) is an actual variant pair
      // and whose period+year is one of our targets.
      const filtered = kpis.filter(k =>
        pairKeys.has(`${nk(k.kra_name)}|${nk(k.kpi_name)}`) &&
        prevPeriods.some(p => p.month === k.review_period && p.year === k.review_year)
      );
      if (filtered.length === 0) return [];

      // Fetch submissions for those KPIs
      const kpiIds = filtered.map(k => k.id);
      const { data: subs, error: sErr } = await supabase
        .from('review_submissions')
        .select('*')
        .in('kpi_id', kpiIds);
      if (sErr) throw sErr;
      const subMap = new Map((subs || []).map(s => [s.kpi_id, s]));

      // Fetch workflows per period individually (RPC accepts singular period/year)
      const uniquePeriods = Array.from(
        new Map(filtered.map(k => [`${k.review_period}_${k.review_year}`, { month: k.review_period, year: k.review_year }])).values()
      );
      const wfMap = new Map<string, string[]>();
      for (const period of uniquePeriods) {
        const { data: wfData } = await supabase.rpc('get_bulk_employee_workflows', {
          employee_ids: [kpi.employee_id],
          p_review_period: period.month,
          p_review_year: period.year,
        });
        if (wfData) {
          for (const w of wfData as any[]) {
            const key = `${period.month}_${period.year}`;
            wfMap.set(key, w.stages || DEFAULT_WORKFLOW_STAGES);
          }
        }
      }

      // Helper: did this prev-month row come from a renamed variant?
      const isRenamedVariant = (k: any) =>
        nk(k.kra_name) !== nk(kpi.kra_name) || nk(k.kpi_name) !== nk(kpi.kpi_name);

      return prevPeriods
        .map(p => {
          const matchKpi = filtered.find(k => k.review_period === p.month && k.review_year === p.year);
          if (!matchKpi) return null;
          const sub = subMap.get(matchKpi.id) || null;
          const wfKey = `${p.month}_${p.year}`;
          const stages = wfMap.get(wfKey) || effectiveStages;
          return {
            period: p,
            kpi: matchKpi,
            submission: sub,
            workflowStages: stages,
            isRenamedVariant: isRenamedVariant(matchKpi),
          };
        })
        .filter(Boolean) as {
          period: { month: string; year: number };
          kpi: any;
          submission: any;
          workflowStages: string[];
          isRenamedVariant: boolean;
        }[];
    },
    enabled: prevPeriods.length > 0 && !!kpi.employee_id && !!kpi.kpi_name,
    staleTime: 2 * 60 * 1000,
  });

  // Fetch audit logs for the KPI
  const { data: auditLogs = [] } = useQuery({
    queryKey: ['kpi-journey-audit-logs', kpi.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kpi_audit_logs')
        .select('id, kpi_id, action, performed_by, on_behalf_of, on_behalf_role, old_value, new_value, metadata, created_at')
        .eq('kpi_id', kpi.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!kpi.id,
    staleTime: 30 * 1000,
  });

  // Fetch performer profiles for audit logs
  const auditUserIds = useMemo(() => {
    const ids = auditLogs.map((l: any) => l.performed_by);
    return [...new Set(ids)] as string[];
  }, [auditLogs]);

  const { data: auditProfiles = [] } = useQuery({
    queryKey: ['kpi-journey-audit-profiles', auditUserIds],
    queryFn: async () => {
      if (auditUserIds.length === 0) return [];
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', auditUserIds);
      if (error) throw error;
      return data || [];
    },
    enabled: auditUserIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const auditProfileMap = useMemo(
    () => new Map(auditProfiles.map((p: any) => [p.id, p])),
    [auditProfiles]
  );

  // Resolve employee details: prefer props, fall back to fetched data
  const resolvedEmployeeName = employeeName || profileData?.fullName || '-';
  const resolvedEmployeeCode = employeeCode || profileData?.employeeCode || '-';
  const resolvedManagerName = reportingManagerName || profileData?.managerName || '-';

  // Recalculate score from achieved value using current KPI thresholds
  // This ensures consistent ratings across all stages regardless of when the score was stored
  const recalcScore = (achievedValue: number | string | null | undefined): { score: number; rating: string } | null => {
    if (achievedValue === null || achievedValue === undefined || achievedValue === '') return null;
    const thresholds: RatingThresholds = {
      r5: kpi.r5 ?? null,
      r4: kpi.r4 ?? null,
      r3: kpi.r3 ?? null,
      r2: kpi.r2 ?? null,
      r1: kpi.r1 ?? null,
      r0: kpi.r0 ?? null,
    };
    const result = calculateRating(
      achievedValue,
      kpi.target_value ?? null,
      thresholds,
      kpi.criteria || 'Higher is Better',
      0,
      (kpi.uom_type as UomType) || 'numeric',
      kpi.qualitative_options as any,
      kpi.uom,
      (kpi.threshold_mode as 'absolute' | 'ratio') || 'absolute'
    );
    return { score: result.rating, rating: result.ratingLevel };
  };

  const openQueries = queries.filter(q => q.status === 'open').length;
  const resolvedQueries = queries.filter(q => q.status === 'resolved').length;

  const buildEvidenceUrls = (urlsField: any, urlField: any): string[] => {
    if (Array.isArray(urlsField) && urlsField.length > 0) return urlsField;
    if (urlField) return [urlField];
    return [];
  };

  // Build stage data with recalculated scores from achieved values
  const buildStage = (
    icon: typeof User,
    iconColor: 'blue' | 'amber' | 'purple' | 'emerald' | 'teal' | 'rose',
    title: string,
    storedScore: number | null,
    storedRating: any,
    remarks: string | null,
    evidenceUrls: string[],
    achievedValue: number | null
  ) => {
    const recalc = recalcScore(achievedValue);
    return {
      icon,
      iconColor,
      title,
      score: storedScore ?? recalc?.score ?? null,
      rating: storedRating ?? recalc?.rating ?? null,
      remarks,
      evidenceUrls,
      achievedValue,
    };
  };

  const stageData: Record<JourneyStage, {
    icon: typeof User;
    iconColor: 'blue' | 'amber' | 'purple' | 'emerald' | 'teal' | 'rose';
    title: string;
    score: number | null;
    rating: any;
    remarks: string | null;
    evidenceUrls: string[];
    achievedValue: number | null;
  }> = {
    self: buildStage(
      User, 'blue', 'Self',
      submission?.self_score ?? null, submission?.self_rating ?? null,
      submission?.self_remarks ?? null,
      buildEvidenceUrls(submission?.self_evidence_urls, submission?.self_evidence_url),
      // Only use orgAchievedValue fallback when a submission record exists (propagation occurred)
      // Otherwise we'd show a phantom score for unpropagated org KPIs still at kra_set
      submission ? (submission.achieved_value ?? orgAchievedValue ?? null) : null
    ),
    manager: buildStage(
      Briefcase, 'amber', 'Manager',
      submission?.manager_score ?? null, submission?.manager_rating ?? null,
      submission?.manager_remarks ?? null,
      buildEvidenceUrls(submission?.manager_evidence_urls, submission?.manager_evidence_url),
      submission?.manager_achieved_value ?? null
    ),
    skip_level: buildStage(
      UserCheck, 'teal', 'Skip-Level',
      submission?.skip_level_score ?? null, submission?.skip_level_rating ?? null,
      submission?.skip_level_remarks ?? null,
      buildEvidenceUrls(submission?.skip_level_evidence_urls, submission?.skip_level_evidence_url),
      submission?.skip_level_achieved_value ?? null
    ),
    hr_pms: buildStage(
      ClipboardCheck, 'rose', 'HR PMS',
      submission?.hr_pms_score ?? null, submission?.hr_pms_rating ?? null,
      submission?.hr_pms_remarks ?? null,
      buildEvidenceUrls(submission?.hr_pms_evidence_urls, submission?.hr_pms_evidence_url),
      submission?.hr_pms_achieved_value ?? null
    ),
    auditor: buildStage(
      Shield, 'purple', 'Auditor',
      submission?.auditor_score ?? null, submission?.auditor_rating ?? null,
      submission?.auditor_remarks ?? null,
      buildEvidenceUrls(submission?.auditor_evidence_urls, submission?.auditor_evidence_url),
      submission?.auditor_achieved_value ?? null
    ),
    management: buildStage(
      Briefcase, 'emerald', 'Management',
      submission?.management_score ?? null, submission?.management_rating ?? null,
      submission?.management_remarks ?? null,
      buildEvidenceUrls(submission?.management_evidence_urls, submission?.management_evidence_url),
      submission?.management_achieved_value ?? null
    ),
  };

  const stageCount = visibleStages.length;
  const gridCols = stageCount <= 4 ? 'grid-cols-2 lg:grid-cols-4' : stageCount <= 6 ? 'grid-cols-2 lg:grid-cols-3 xl:grid-cols-6' : 'grid-cols-2 lg:grid-cols-4';

  const hasAnyData = visibleStages.some(stage => {
    const status = getStageStatus(stage, kpiStatus, viewLevel, effectiveStages);
    return status !== 'pending';
  }) || auditLogs.length > 0;

  // Format audit log details (same logic as KpiTimeline.tsx formatDetails)
  const formatAuditDetails = (log: any): string[] => {
    const details: string[] = [];
    if (log.metadata?.reason) details.push(`Admin Reason: ${String(log.metadata.reason)}`);
    if (log.new_value) {
      if (log.new_value.source === 'org_kpi_data_owner') {
        if (log.new_value.is_na) details.push('Marked as N/A');
        else if (log.new_value.achieved_value !== undefined && log.new_value.achieved_value !== null)
          details.push(`Achieved Value: ${log.new_value.achieved_value}`);
        if (log.new_value.self_score) details.push(`Score: ${log.new_value.self_score}`);
        if (log.new_value.self_rating) details.push(`Rating: ${log.new_value.self_rating}`);
      } else {
        if (log.new_value.self_score) details.push(`Self Score: ${log.new_value.self_score}`);
        if (log.new_value.manager_score) details.push(`Manager Score: ${log.new_value.manager_score}`);
        if (log.new_value.auditor_score) details.push(`Auditor Score: ${log.new_value.auditor_score}`);
        if (log.new_value.management_score) details.push(`Management Score: ${log.new_value.management_score}`);
        if (log.new_value.self_rating) details.push(`Rating: ${log.new_value.self_rating}`);
        if (log.new_value.manager_rating) details.push(`Rating: ${log.new_value.manager_rating}`);
        if (log.new_value.auditor_rating) details.push(`Rating: ${log.new_value.auditor_rating}`);
        if (log.new_value.management_rating) details.push(`Rating: ${log.new_value.management_rating}`);
      }
      if (log.new_value.reason) details.push(`Reason: ${log.new_value.reason}`);
      if (log.new_value.resolution_notes) details.push(`Resolution: ${log.new_value.resolution_notes}`);
      if (log.new_value.target) details.push(`Sent to: ${log.new_value.target}`);
      if (log.new_value.status) {
        const label = statusLabels[String(log.new_value.status)] || String(log.new_value.status).replace(/_/g, ' ');
        details.push(`New Status: ${label}`);
      }
      if (log.new_value.na_remarks) details.push(`N/A Remarks: ${log.new_value.na_remarks}`);
      if (log.new_value.self_remarks) details.push(`Self Remarks: ${log.new_value.self_remarks}`);
      if (log.new_value.manager_remarks) details.push(`Manager Remarks: ${log.new_value.manager_remarks}`);
      if (log.new_value.auditor_remarks) details.push(`Auditor Remarks: ${log.new_value.auditor_remarks}`);
      if (log.new_value.management_remarks) details.push(`Management Remarks: ${log.new_value.management_remarks}`);
    }
    return details;
  };

  const actionLabelMap: Record<string, string> = {
    SELF_REVIEW_SUBMITTED: 'Self Review Submitted',
    MANAGER_APPROVED: 'Manager Approved',
    MANAGER_REVIEWED: 'Manager Reviewed',
    QUERY_RAISED: 'Query Raised',
    QUERY_RESOLVED: 'Query Resolved',
    AUDITOR_REVIEWED: 'Auditor Reviewed',
    AUDITOR_APPROVED: 'Auditor Approved',
    AUDITOR_SENT_BACK_TO_MANAGER: 'Sent Back to Manager',
    AUDITOR_SENT_BACK_TO_EMPLOYEE: 'Sent Back to Employee',
    MANAGEMENT_REVIEWED: 'Management Reviewed',
    MANAGEMENT_APPROVED: 'Management Approved',
    MANAGEMENT_SENT_BACK_TO_AUDITOR: 'Sent Back to Auditor',
    MANAGER_SENT_BACK_TO_EMPLOYEE: 'Sent Back to Employee',
    MANAGEMENT_SENT_BACK_TO_MANAGER: 'Sent Back to Manager',
    MANAGEMENT_SENT_BACK_TO_EMPLOYEE: 'Sent Back to Employee',
    KPI_CREATED: 'KPI Created',
    KPI_UPDATED: 'KPI Updated',
    STATUS_CHANGED: 'Status Changed',
    STATUS_TRANSITION: 'Status Changed',
    MANAGER_NA_CONFIRMED: 'Manager Confirmed N/A',
    AUDITOR_NA_CONFIRMED: 'Auditor Confirmed N/A',
    MANAGEMENT_NA_CONFIRMED: 'Management Confirmed N/A',
    ADMIN_DATA_ENTRY_SELF: 'Admin Entered Self Data',
    ADMIN_DATA_ENTRY_MANAGER: 'Admin Entered Manager Data',
    ADMIN_DATA_ENTRY_AUDITOR: 'Admin Entered Auditor Data',
    ADMIN_DATA_ENTRY_MANAGEMENT: 'Admin Entered Management Data',
    ADMIN_DAILY_ENTRY_OVERRIDE: 'Admin Daily Entry Override',
    ADMIN_STATUS_OVERRIDE: 'Admin Status Override',
    ADMIN_OVERRIDE: 'Admin Override',
    MANAGER_DAILY_OVERRIDE: 'Manager Daily Override',
    ADMIN_STATUS_STEP_BACK: 'Admin Status Step Back',
    AUDITOR_FORWARDED: 'Auditor Forwarded',
    MANAGER_FORWARDED: 'Manager Forwarded',
    ORG_KPI_PROPAGATED: 'Org KPI Data Entered',
    ORG_KPI_VALUE_UPDATED: 'Org KPI Value Updated',
  };

  const handleDownloadPdf = () => {
    const pdfData: ReviewTimelinePdfData = {
      employeeName: resolvedEmployeeName,
      employeeCode: resolvedEmployeeCode,
      reportingManagerName: resolvedManagerName,
      kpi: {
        kraName: kpi.kra_name || '',
        kpiName: kpi.kpi_name || '',
        category: kpi.kra_categories?.name || '-',
        target: kpi.target_value,
        uom: kpi.uom,
        criteria: kpi.criteria,
        weightage: kpi.weightage,
        frequency: kpi.frequency,
        status: kpi.status || 'kra_set',
      },
      stages: visibleStages.map(stage => {
        const data = stageData[stage];
        const status = getStageStatus(stage, kpiStatus, viewLevel, effectiveStages);
        return {
          title: data.title,
          score: data.score,
          rating: data.rating,
          achievedValue: data.achievedValue,
          remarks: data.remarks,
          status,
        };
      }),
      period: kpi.review_period || '',
      year: String(kpi.review_year || new Date().getFullYear()),
      isNA: globalIsNA,
      auditLogs: auditLogs.map((log: any) => {
        const performer = auditProfileMap.get(log.performed_by);
        return {
          label: actionLabelMap[log.action] || log.action.replace(/_/g, ' '),
          performerName: performer?.full_name || performer?.email || 'System',
          date: format(new Date(log.created_at), 'dd MMM yyyy, hh:mm a'),
          details: formatAuditDetails(log),
        };
      }),
    };
    exportReviewTimelinePdf(pdfData);
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <History className="h-4 w-4" />
            Review Journey
          </CardTitle>
          {hasAnyData && (
            <Button variant="ghost" size="sm" onClick={handleDownloadPdf} className="h-7 text-xs gap-1">
              <Download className="h-3.5 w-3.5" />
              PDF
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Auto-Advance Warning Banner */}
        {(submission as any)?.auto_advance_reason && (
          <Alert className="border-orange-500/30 bg-orange-500/5">
            <AlertTriangle className="h-4 w-4 text-orange-600" />
            <AlertDescription className="text-sm">
              <strong>System Auto-Advanced:</strong> {(submission as any).auto_advance_reason}
            </AlertDescription>
          </Alert>
        )}

        {/* Compliance Factors Banner */}
        {isCompliance && complianceData?.subFactors && (
          <div className="border rounded-lg p-3 bg-muted/30 space-y-1">
            <div className="flex items-center gap-1.5 mb-1.5">
              <FileCheck className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground">Compliance Factors</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-4 gap-y-1 text-xs">
              <div>
                <span className="text-muted-foreground">Policy Compliance: </span>
                <span className="font-medium">{complianceData.subFactors.policy_compliance === true ? 'Yes' : complianceData.subFactors.policy_compliance === false ? 'No' : '—'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Submission: </span>
                <span className="font-medium">
                  {complianceData.subFactors.submission_date
                    ? format(new Date(complianceData.subFactors.submission_date), 'dd MMM yyyy')
                    : complianceData.subFactors.submission_complete
                      ? 'Complete'
                      : `${complianceData.subFactors.submission_pending_count} pending`}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Policy Training: </span>
                <span className="font-medium">{complianceData.subFactors.policy_training === true ? 'Yes' : complianceData.subFactors.policy_training === false ? 'No' : '—'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Other Obs.: </span>
                <span className="font-medium">{complianceData.subFactors.other_observation ?? '—'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Achieved: </span>
                <span className="font-medium">{complianceData.achievedValue ?? '—'}</span>
              </div>
            </div>
          </div>
        )}

        {/* Terminal Month Status Banner for non-terminal multi-month KPIs */}
        {isLockedSibling && terminalMonth && terminalKpiData && terminalKpiData.status !== 'approved' && (
          <Alert className={terminalKpiData.hasSubmission 
            ? "border-blue-500/30 bg-blue-500/5" 
            : "border-muted bg-muted/30"
          }>
            <CalendarClock className={`h-4 w-4 ${terminalKpiData.hasSubmission ? 'text-blue-600' : 'text-muted-foreground'}`} />
            <AlertDescription className="text-sm">
              {terminalKpiData.hasSubmission ? (
                <>
                  <strong>Data entered in {terminalMonth} {kpi.review_year}</strong> — currently at{' '}
                  <Badge variant="secondary" className="text-xs mx-1">
                    {statusLabels[terminalKpiData.status] || terminalKpiData.status}
                  </Badge>.
                  Scores will appear here once the terminal month is approved.
                </>
              ) : (
                <>
                  This is a <strong>{kpi.frequency}</strong> KPI. Data entry happens in the terminal month ({terminalMonth} {kpi.review_year}). No data entered yet.
                </>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* Review Stages Grid */}
        <div className={`grid ${gridCols} gap-2 lg:gap-3`}>
        {visibleStages.map(stage => {
            const data = stageData[stage];
            const status = getStageStatus(stage, kpiStatus, viewLevel, effectiveStages);
            const isAutoAdvanced = !!(submission as any)?.auto_advance_reason;
            const stageIsNA = !isAutoAdvanced && ((globalIsNA && data.score === null && status !== 'pending') || (!globalIsNA && data.score === null && status !== 'pending' && status === 'completed'));
            return (
              <ReviewStageCard
                key={stage}
                icon={data.icon}
                iconColor={data.iconColor}
                title={data.title}
                score={data.score}
                rating={data.rating}
                remarks={data.remarks}
                evidenceUrls={data.evidenceUrls}
                status={status}
                isNA={stageIsNA}
                achievedValue={data.achievedValue}
                kpiName={kpi.kpi_name}
                employeeCode={resolvedEmployeeCode !== '-' ? resolvedEmployeeCode : null}
              />
            );
          })}
        </div>

        {/* Previous Months Comparison */}
        {prevMonthsData.length > 0 && (
          <Collapsible open={prevMonthsOpen} onOpenChange={setPrevMonthsOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-between h-8 text-xs text-muted-foreground hover:text-foreground">
                <span className="flex items-center gap-1.5">
                  <CalendarClock className="h-3.5 w-3.5" />
                  Previous Months ({prevMonthsData.length})
                </span>
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${prevMonthsOpen ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 pt-2">
              {prevMonthsData.map(({ period, kpi: prevKpi, submission: prevSub, workflowStages: prevWf, isRenamedVariant }) => {
                const prevStages = getVisibleStagesForLevel(viewLevel, prevWf);
                const prevStatus = prevKpi.status || 'kra_set';
                const prevIsNA = prevSub?.is_na || false;
                const prevGridCols = prevStages.length <= 4 ? 'grid-cols-2 lg:grid-cols-4' : prevStages.length <= 6 ? 'grid-cols-2 lg:grid-cols-3 xl:grid-cols-6' : 'grid-cols-2 lg:grid-cols-4';

                const prevStageData: Record<string, any> = {
                  self: buildStage(User, 'blue', 'Self', prevSub?.self_score ?? null, prevSub?.self_rating ?? null, prevSub?.self_remarks ?? null, buildEvidenceUrls(prevSub?.self_evidence_urls, prevSub?.self_evidence_url), prevSub?.achieved_value ?? null),
                  manager: buildStage(Briefcase, 'amber', 'Manager', prevSub?.manager_score ?? null, prevSub?.manager_rating ?? null, prevSub?.manager_remarks ?? null, buildEvidenceUrls(prevSub?.manager_evidence_urls, prevSub?.manager_evidence_url), prevSub?.manager_achieved_value ?? null),
                  skip_level: buildStage(UserCheck, 'teal', 'Skip-Level', prevSub?.skip_level_score ?? null, prevSub?.skip_level_rating ?? null, prevSub?.skip_level_remarks ?? null, buildEvidenceUrls(prevSub?.skip_level_evidence_urls, prevSub?.skip_level_evidence_url), prevSub?.skip_level_achieved_value ?? null),
                  hr_pms: buildStage(ClipboardCheck, 'rose', 'HR PMS', prevSub?.hr_pms_score ?? null, prevSub?.hr_pms_rating ?? null, prevSub?.hr_pms_remarks ?? null, buildEvidenceUrls(prevSub?.hr_pms_evidence_urls, prevSub?.hr_pms_evidence_url), prevSub?.hr_pms_achieved_value ?? null),
                  auditor: buildStage(Shield, 'purple', 'Auditor', prevSub?.auditor_score ?? null, prevSub?.auditor_rating ?? null, prevSub?.auditor_remarks ?? null, buildEvidenceUrls(prevSub?.auditor_evidence_urls, prevSub?.auditor_evidence_url), prevSub?.auditor_achieved_value ?? null),
                  management: buildStage(Briefcase, 'emerald', 'Management', prevSub?.management_score ?? null, prevSub?.management_rating ?? null, prevSub?.management_remarks ?? null, buildEvidenceUrls(prevSub?.management_evidence_urls, prevSub?.management_evidence_url), prevSub?.management_achieved_value ?? null),
                };

                return (
                  <div key={`${period.month}-${period.year}`} className="border rounded-lg p-3 bg-muted/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className="text-xs font-medium">
                        {period.month} {period.year}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">
                        {statusLabels[prevStatus] || prevStatus.replace(/_/g, ' ')}
                      </Badge>
                      {isRenamedVariant && (
                        <TooltipProvider delayDuration={150}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span
                                className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"
                                aria-label="Also known as a different KPI name in this period"
                              >
                                <GitMerge className="h-3 w-3" />
                                <span>Also known as</span>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              <p className="text-xs font-medium mb-1">Standardized via registry</p>
                              <p className="text-xs text-muted-foreground">
                                In {period.month} {period.year}, this KPI was recorded as:
                              </p>
                              <p className="text-xs mt-1">
                                <span className="font-medium">{prevKpi.kra_name}</span>
                                {' / '}
                                <span className="font-medium">{prevKpi.kpi_name}</span>
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                    <div className={`grid ${prevGridCols} gap-2`}>
                      {prevStages.map(stage => {
                        const data = prevStageData[stage];
                        if (!data) return null;
                        const status = getStageStatus(stage, prevStatus, viewLevel, prevWf);
                        const isPrevAutoAdvanced = !!(prevSub as any)?.auto_advance_reason;
                        const stageIsNA = !isPrevAutoAdvanced && ((prevIsNA && data.score === null && status !== 'pending') || (!prevIsNA && data.score === null && status !== 'pending' && status === 'completed'));
                        return (
                          <ReviewStageCard
                            key={stage}
                            icon={data.icon}
                            iconColor={data.iconColor}
                            title={data.title}
                            score={data.score}
                            rating={data.rating}
                            remarks={data.remarks}
                            evidenceUrls={data.evidenceUrls}
                            status={status}
                            isNA={stageIsNA}
                            achievedValue={data.achievedValue}
                            kpiName={prevKpi.kpi_name}
                            employeeCode={resolvedEmployeeCode !== '-' ? resolvedEmployeeCode : null}
                          />);
                      })}
                    </div>
                  </div>
                );
              })}
            </CollapsibleContent>
          </Collapsible>
        )}

        {(openQueries > 0 || resolvedQueries > 0) && (
          <div className="pt-3 border-t flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <span className="flex items-center gap-1">
                {openQueries > 0 && (
                  <Badge variant="secondary" className="mr-1">
                    {openQueries} open
                  </Badge>
                )}
                {resolvedQueries > 0 && (
                  <Badge variant="outline">
                    {resolvedQueries} resolved
                  </Badge>
                )}
              </span>
            </div>
            {onOpenQueryHistory && (
              <Button variant="ghost" size="sm" onClick={onOpenQueryHistory} className="h-7 text-xs">
                View History
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
