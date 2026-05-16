/**
 * TeamReviewsZeroDiagnostic — v2.66.11.11
 *
 * Renders an amber Alert explaining WHY a manager / skip-level user sees an
 * empty Team Reviews dashboard. Decision tree is exposed as a pure helper
 * (`diagnoseEmptyTeam`) so it can be unit-tested without React.
 *
 * Only rendered for non-full-access roles when `stats.totalEmployees === 0`.
 */
import { Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export type ZeroDiagnosisCode =
  | 'no_reports_mapped'
  | 'reports_without_kpis'
  | 'kpis_filtered_out'
  | 'data_load_error';

export interface ZeroDiagnosis {
  code: ZeroDiagnosisCode;
  title: string;
  message: string;
}

export function diagnoseEmptyTeam(input: {
  directCount: number;
  skipCount: number;
  periodKpiCount: number;
  totalEmployees: number;
  selectedPeriod: string;
  selectedYear: number | string;
  dataLoadError?: boolean;
}): ZeroDiagnosis {
  const { directCount, skipCount, periodKpiCount, totalEmployees, selectedPeriod, selectedYear, dataLoadError } = input;
  const reportsTotal = directCount + skipCount;

  if (dataLoadError) {
    return {
      code: 'data_load_error',
      title: 'Dashboard data could not be loaded',
      message:
        'The roster or KPI query failed to return. This is usually a transient network or backend issue — try Refresh roster, or reload the page in a moment.',
    };
  }

  if (reportsTotal === 0) {
    return {
      code: 'no_reports_mapped',
      title: 'No reports mapped to you',
      message:
        'No direct or indirect reports are mapped to you for this period. Ask Admin to verify your reporting structure in User Management.',
    };
  }
  if (periodKpiCount === 0) {
    return {
      code: 'reports_without_kpis',
      title: 'No KPIs assigned for this period',
      message: `You have ${reportsTotal} report${reportsTotal === 1 ? '' : 's'} mapped, but none have KPIs assigned for ${selectedPeriod} ${selectedYear}. KRAs may not yet be issued — check the KRA Issuance report.`,
    };
  }
  // periodKpiCount > 0 but stats.totalEmployees === 0 → filtered out
  return {
    code: 'kpis_filtered_out',
    title: 'KPIs hidden by current filters',
    message:
      totalEmployees === 0
        ? 'KPIs exist for your reports but none match the active filters or workflow stage. Try clearing filters or switching the status tile.'
        : 'No employees match the active filters.',
  };
}

interface Props {
  directCount: number;
  skipCount: number;
  periodKpiCount: number;
  totalEmployees: number;
  selectedPeriod: string;
  selectedYear: number | string;
  dataLoadError?: boolean;
  onRefresh?: () => void;
}

export function TeamReviewsZeroDiagnostic(props: Props) {
  const diag = diagnoseEmptyTeam(props);
  return (
    <Alert className="border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30">
      <Info className="h-4 w-4 text-amber-600 dark:text-amber-400" />
      <AlertTitle className="text-amber-900 dark:text-amber-200">{diag.title}</AlertTitle>
      <AlertDescription className="text-amber-800 dark:text-amber-300/90 text-xs sm:text-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <span>{diag.message}</span>
        {props.onRefresh && (
          <Button size="sm" variant="outline" onClick={props.onRefresh} className="shrink-0">
            Refresh roster
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}