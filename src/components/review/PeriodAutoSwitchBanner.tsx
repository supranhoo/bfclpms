/**
 * Disclosure banner shown in reviewer scorecards when the displayed review
 * period was auto-switched by Smart Period Detection (e.g. EmployeeSelectorGrid
 * jumped to the most recent period with KPIs because the panel-selected period
 * had no data for this employee).
 *
 * See `mem://features/review/smart-period-detection-workflow`.
 */
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CalendarClock } from 'lucide-react';

interface PeriodAutoSwitchBannerProps {
  displayedPeriod: string;
  displayedYear: number;
  panelPeriod?: string;
  panelYear?: number;
}

export function PeriodAutoSwitchBanner({
  displayedPeriod,
  displayedYear,
  panelPeriod,
  panelYear,
}: PeriodAutoSwitchBannerProps) {
  if (!panelPeriod || !panelYear) return null;
  if (panelPeriod === displayedPeriod && panelYear === displayedYear) return null;

  return (
    <Alert className="border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200">
      <CalendarClock className="h-4 w-4 !text-amber-600 dark:!text-amber-400" />
      <AlertDescription className="text-sm">
        Showing <strong>{displayedPeriod} {displayedYear}</strong>{' '}
        (auto-switched — KPIs found here). You selected{' '}
        <strong>{panelPeriod} {panelYear}</strong> in the panel filter, which
        has no pending work for this employee.
      </AlertDescription>
    </Alert>
  );
}
