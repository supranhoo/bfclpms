import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { TeamQueueFilter } from '@/lib/review/actionableQueueFilter';

interface TeamQueueToggleProps {
  value: TeamQueueFilter;
  onValueChange: (value: TeamQueueFilter) => void;
  actionableCount?: number;
  assignedCount?: number;
  totalCount?: number;
}

const MODES: { key: TeamQueueFilter; label: string }[] = [
  { key: 'assigned', label: 'With KRAs' },
  { key: 'actionable', label: 'Pending action' },
  { key: 'all', label: 'All' },
];

/**
 * ADR-348 / ADR-359 — POLICY §129 Team Reviews queue selector.
 * Default view shows every team member who has KRAs for the period, even when
 * nothing is pending with this reviewer.
 */
export function TeamQueueToggle({
  value,
  onValueChange,
  actionableCount,
  assignedCount,
  totalCount,
}: TeamQueueToggleProps) {
  const shown =
    value === 'all' ? totalCount : value === 'actionable' ? actionableCount : assignedCount;

  return (
    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
      <div
        role="group"
        aria-label="Team list view"
        className="inline-flex items-center rounded-md border bg-muted/40 p-0.5"
      >
        {MODES.map((m) => (
          <Button
            key={m.key}
            type="button"
            size="sm"
            variant="ghost"
            aria-pressed={value === m.key}
            onClick={() => onValueChange(m.key)}
            className={cn(
              'h-8 px-2.5 text-xs font-medium',
              value === m.key && 'bg-background shadow-sm text-foreground',
            )}
          >
            {m.label}
          </Button>
        ))}
      </div>
      {typeof shown === 'number' && typeof totalCount === 'number' && (
        <span className="text-xs text-muted-foreground">
          Showing <span className="font-medium text-foreground">{shown}</span> of{' '}
          <span className="font-medium text-foreground">{totalCount}</span> mapped members
          {typeof actionableCount === 'number' && ` · ${actionableCount} pending your action`}
        </span>
      )}
    </div>
  );
}
