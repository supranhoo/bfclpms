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
import { Button } from '@/components/ui/button';

interface PeriodAutoSwitchBannerProps {
  displayedPeriod: string;
  displayedYear: number;
  panelPeriod?: string;
  panelYear?: number;
  /**
   * v2.64.8: When provided, renders an "Update grid period" CTA that pushes
   * the auto-switched period back to the parent grid so card counts and
   * scorecard counts align after the user accepts the switch.
   */
  onAcceptSwitch?: () => void;
}

export function PeriodAutoSwitchBanner({
  displayedPeriod,
  displayedYear,
  panelPeriod,
  panelYear,
  onAcceptSwitch,
}: PeriodAutoSwitchBannerProps) {
  if (!panelPeriod || !panelYear) return null;
  if (panelPeriod === displayedPeriod && panelYear === displayedYear) return null;

  return (
    <Alert className="border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200">
      <CalendarClock className="h-4 w-4 !text-amber-600 dark:!text-amber-400" />
      <AlertDescription className="text-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <span>
          Showing <strong>{displayedPeriod} {displayedYear}</strong>{' '}
          (auto-switched — KPIs found here). You selected{' '}
          <strong>{panelPeriod} {panelYear}</strong> in the panel filter, which
          has no pending work for this employee.
        </span>
        {onAcceptSwitch && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs border-amber-400 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900 shrink-0"
            onClick={onAcceptSwitch}
          >
            Update grid period to {displayedPeriod} {displayedYear}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
