import { KPI, ReviewSubmission, KpiQuery } from '@/hooks/useKpis';
import { SubPeriodSubmission } from '@/hooks/useSubPeriodSubmissions';
import { KpiHeaderSection } from './KpiHeaderSection';
import { KpiMetricsSection } from './KpiMetricsSection';
import { KpiJourneySection } from './KpiJourneySection';
import { KpiHistoryCard } from './KpiHistoryCard';
import { KpiObservationsSection } from './KpiObservationsSection';

export type ViewLevel = 'employee' | 'manager' | 'auditor' | 'management';

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
}: KpiReviewPanelProps) {
  const isOwnKpi = currentUserId ? kpi.employee_id === currentUserId : false;
  return (
    <div className="space-y-4">
      {/* KPI Header - Full Width */}
      <KpiHeaderSection
        kpi={kpi}
        selectedPeriod={selectedPeriod}
        selectedYear={selectedYear}
      />

      {/* Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* LEFT COLUMN (40%) - Metrics & History */}
        <div className="lg:col-span-2 space-y-4">
          <KpiMetricsSection kpi={kpi} />
          
          <KpiHistoryCard
            kpi={kpi}
            allKpis={allKpis}
            submissions={allSubmissions}
            onViewFullHistory={onOpenFullHistory}
          />
        </div>

        {/* RIGHT COLUMN (60%) - Review Journey & Observations */}
        <div className="lg:col-span-3 space-y-4">
          <KpiJourneySection
            kpi={kpi}
            submission={submission}
            queries={queries}
            viewLevel={viewLevel}
            onOpenQueryHistory={onOpenQueryHistory}
          />
          
          <KpiObservationsSection
            kpiId={kpi.id}
            kpiStatus={kpi.status || 'kra_set'}
            viewLevel={viewLevel}
            baseScore={submission?.final_score ?? submission?.self_score ?? null}
            isOwnKpi={isOwnKpi}
          />
        </div>
      </div>
    </div>
  );
}
