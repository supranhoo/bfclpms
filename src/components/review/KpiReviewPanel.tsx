import { KPI, ReviewSubmission, KpiQuery } from '@/hooks/useKpis';
import { SubPeriodSubmission } from '@/hooks/useSubPeriodSubmissions';
import { KpiHeaderSection } from './KpiHeaderSection';
import { KpiMetricsSection } from './KpiMetricsSection';
import { KpiJourneySection } from './KpiJourneySection';
import { KpiHistoryCard } from './KpiHistoryCard';
import { KpiObservationsSection } from './KpiObservationsSection';

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

  // Callbacks
  onOpenQueryHistory?: () => void;
  onOpenFullHistory?: () => void;
  onOpenTimeline?: () => void;
  workflowStages?: string[];
  orgKpiEnteredByName?: string | null;
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
  onOpenQueryHistory,
  onOpenFullHistory,
  onOpenTimeline,
  workflowStages,
  orgKpiEnteredByName,
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
          <KpiJourneySection
            kpi={kpi}
            submission={submission}
            queries={queries}
            viewLevel={viewLevel}
            onOpenQueryHistory={onOpenQueryHistory}
            workflowStages={workflowStages}
          />
          
          <KpiObservationsSection
            kpiId={kpi.id}
            kpiStatus={kpi.status || 'kra_set'}
            viewLevel={viewLevel}
            baseScore={submission?.final_score ?? submission?.management_score ?? submission?.auditor_score ?? submission?.manager_score ?? submission?.self_score ?? null}
            isOwnKpi={isOwnKpi}
          />
        </div>
      </div>
    </div>
  );
}
