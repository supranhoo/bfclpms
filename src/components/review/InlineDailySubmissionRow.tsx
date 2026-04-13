import React from 'react';
import { TableRow, TableCell } from '@/components/ui/table';
import { DailySubmissionSummary } from '@/components/review/DailySubmissionSummary';
import { useSubPeriodSubmissions } from '@/hooks/useSubPeriodSubmissions';
import { KPI } from '@/hooks/useKpis';
import { QualitativeOption } from '@/lib/qualitativeUom';

interface InlineDailySubmissionRowProps {
  kpi: KPI;
  selectedPeriod: string;
  selectedYear: number;
  colSpan?: number;
}

export function InlineDailySubmissionRow({
  kpi,
  selectedPeriod,
  selectedYear,
  colSpan = 8,
}: InlineDailySubmissionRowProps) {
  // Fetch submissions for this specific KPI
  const { data: submissions, isLoading } = useSubPeriodSubmissions(
    kpi.id,
    selectedPeriod,
    selectedYear
  );

  // Don't show if no submissions
  if (isLoading || !submissions || submissions.length === 0) {
    return (
      <TableRow className="bg-muted/30">
        <TableCell colSpan={colSpan} className="py-3 px-4">
          <div className="text-sm text-muted-foreground italic">
            {isLoading ? 'Loading daily submissions...' : 'No daily submissions recorded yet'}
          </div>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow className="bg-muted/30 hover:bg-muted/40">
      <TableCell colSpan={colSpan} className="py-3 px-4">
        <DailySubmissionSummary
          kpiId={kpi.id}
          kpiName={kpi.kpi_name}
          reviewMonth={selectedPeriod}
          reviewYear={selectedYear}
          submissions={submissions}
          uom={kpi.uom}
          uomType={kpi.uom_type}
          qualitativeOptions={kpi.qualitative_options as QualitativeOption[] | null}
          kpiStatus={kpi.status}
          compact
        />
      </TableCell>
    </TableRow>
  );
}
