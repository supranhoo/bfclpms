import { KPI, ReviewSubmission, KpiQuery } from '@/hooks/useKpis';
import { SubPeriodSubmission } from '@/hooks/useSubPeriodSubmissions';
import { KpiHeaderSection } from './KpiHeaderSection';
import { KpiMetricsSection } from './KpiMetricsSection';
import { KpiJourneySection } from './KpiJourneySection';
import { KpiHistoryCard } from './KpiHistoryCard';
import { KpiObservationsSection } from './KpiObservationsSection';
import { ManagerKpiBenchmark } from './ManagerKpiBenchmark';

export type ViewLevel = 'employee' | 'manager' | 'auditor' | 'management' | 'skip_level' | 'hr_pms' | 'admin';

interface KpiReviewPanelProps {
  kpi: KPI;
  submission: ReviewSubmission | null;
  allKpis: KPI[];
  allSubmissions: ReviewSubmission[];
  queries?: KpiQuery[];

  // View context
  viewLevel: ViewLevel;
  isReadOnly?: boolean;
  currentUserId?: string;

  // Period info
  selectedPeriod: string;
  selectedYear: number;

  // Employee info for PDF export
  employeeName?: string;
  employeeCode?: string;
  reportingManagerName?: string;

  // Callbacks
  onOpenQueryHistory?: () => void;
  onOpenFullHistory?: () => void;
  onOpenTimeline?: () => void;
  workflowStages?: string[];
  orgKpiEnteredByName?: string | null;
  orgKpiDataOwnerNames?: string[];
  orgAchievedValue?: number | null;
  /** v2.65.0 — Explorer Mode: read-only browsing for auditors outside their scope */
  exploreMode?: boolean;
}

export function KpiReviewPanel({
  kpi,
  submission,
  allKpis,
  allSubmissions,
  queries = [],
  viewLevel,
  currentUserId,
  selectedPeriod,
  selectedYear,
  employeeName,
  employeeCode,
  reportingManagerName,
  onOpenQueryHistory,
  onOpenFullHistory,
  onOpenTimeline,
  workflowStages,
  orgKpiEnteredByName,
  orgKpiDataOwnerNames,
  orgAchievedValue,
  exploreMode = false,
}: KpiReviewPanelProps) {
  const isOwnKpi = currentUserId ? kpi.employee_id === currentUserId : false;
  return (
    <div className="space-y-3 sm:space-y-4">
      {/* KPI Header - Full Width */}
      <KpiHeaderSection
        kpi={kpi}
        selectedPeriod={selectedPeriod}
        selectedYear={selectedYear}
        onOpenTimeline={onOpenTimeline}
        orgKpiEnteredByName={orgKpiEnteredByName}
        orgKpiDataOwnerNames={orgKpiDataOwnerNames}
        employeeId={kpi.employee_id}
        workflowStages={workflowStages}
      />

      {/* Two-Column Layout - collapses at md breakpoint for mobile sheets */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 md:gap-4">
        {/* LEFT COLUMN (40%) - Metrics & History */}
        <div className="md:col-span-2 space-y-3 sm:space-y-4">
          <KpiMetricsSection kpi={kpi} />
          
          <KpiHistoryCard
            kpi={kpi}
            allKpis={allKpis}
            submissions={allSubmissions}
            onViewFullHistory={onOpenFullHistory}
          />
        </div>

        {/* RIGHT COLUMN (60%) - Review Journey & Observations */}
        <div className="md:col-span-3 space-y-3 sm:space-y-4">
          <ManagerKpiBenchmark kpi={kpi} />
          <KpiJourneySection
            kpi={kpi}
            submission={submission}
            queries={queries}
            viewLevel={viewLevel}
            onOpenQueryHistory={onOpenQueryHistory}
            workflowStages={workflowStages}
            employeeName={employeeName}
            employeeCode={employeeCode}
            reportingManagerName={reportingManagerName}
            orgAchievedValue={orgAchievedValue}
          />
          
          <KpiObservationsSection
            kpiId={kpi.id}
            kpiStatus={kpi.status || 'kra_set'}
            viewLevel={viewLevel}
            baseScore={(kpi.status === 'approved' ? submission?.final_score : null) ?? submission?.management_score ?? submission?.auditor_score ?? submission?.manager_score ?? submission?.self_score ?? null}
            isOwnKpi={isOwnKpi}
            exploreMode={exploreMode}
          />
        </div>
      </div>
    </div>
  );
}
