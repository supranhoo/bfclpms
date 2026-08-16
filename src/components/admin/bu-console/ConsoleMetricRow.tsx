/**
 * ADR-268 — dense, review-first row used by the BU Performance Console tree.
 * Purely presentational: index chip + title/subtitle on the left, labelled
 * metric columns on the right, whole row is one tap target (>=44px).
 */
import { type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ConsoleMetric {
  label: string;
  value: ReactNode;
}

/** Fixed metric column width so rows stack into visible columns (ADR-277). */
export const METRIC_COL = 'w-[92px]';

/** Column header rail matching ConsoleMetricRow's metric columns. */
export function ConsoleMetricHeader({
  labels,
  className,
}: {
  labels: string[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        'hidden items-center gap-3 border-b bg-muted/40 px-3 py-1.5 sm:flex',
        className,
      )}
    >
      <span className="h-7 w-7 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Name
      </span>
      <span className="flex shrink-0 gap-3">
        {labels.map(l => (
          <span
            key={l}
            className={cn(
              METRIC_COL,
              'text-right text-[10px] font-semibold uppercase tracking-wide text-muted-foreground',
            )}
          >
            {l}
          </span>
        ))}
      </span>
      <span className="w-4 shrink-0" aria-hidden />
    </div>
  );
}

interface ConsoleMetricRowProps {
  index?: number;
  title: string;
  subtitle?: ReactNode;
  metrics?: ConsoleMetric[];
  selected?: boolean;
  onClick?: () => void;
  trailing?: ReactNode;
  className?: string;
  /** Hide the per-row metric labels when a column header rail is present. */
  hideMetricLabels?: boolean;
  /** Render the row as a disclosure toggle (ADR-278) instead of a link-like row. */
  expandable?: boolean;
  expanded?: boolean;
  /** id of the panel this row discloses. */
  ariaControls?: string;
}

export function ConsoleMetricRow({
  index,
  title,
  subtitle,
  metrics = [],
  selected,
  onClick,
  trailing,
  className,
  hideMetricLabels,
  expandable,
  expanded,
  ariaControls,
}: ConsoleMetricRowProps) {
  const interactive = typeof onClick === 'function';
  const Comp: any = interactive ? 'button' : 'div';
  return (
    <Comp
      type={interactive ? 'button' : undefined}
      onClick={onClick}
      aria-expanded={expandable ? !!expanded : undefined}
      aria-controls={expandable && expanded ? ariaControls : undefined}
      className={cn(
        'relative flex w-full min-h-[56px] items-center gap-3 px-3 py-2.5 text-left',
        'before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-transparent before:transition-colors',
        interactive &&
          'transition-colors hover:bg-accent/60 hover:before:bg-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        selected && 'bg-accent before:bg-primary',
        className,
      )}
    >
      {typeof index === 'number' && (
        <span className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-[11px] font-semibold tabular-nums text-muted-foreground sm:flex">
          {String(index).padStart(2, '0')}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium leading-tight">{title}</p>
        {subtitle && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>

      {metrics.length > 0 && (
        <div className="grid shrink-0 grid-cols-2 gap-x-4 gap-y-1 sm:flex sm:gap-3">
          {metrics.map(m => (
            <div key={m.label} className="min-w-[72px] text-right sm:w-[92px] sm:min-w-[92px]">
              <p
                className={cn(
                  'text-[10px] uppercase tracking-wide text-muted-foreground',
                  hideMetricLabels && 'sm:hidden',
                )}
              >
                {m.label}
              </p>
              <p className="text-sm font-semibold tabular-nums">{m.value}</p>
            </div>
          ))}
        </div>
      )}

      {trailing}
      {interactive && !trailing && (
        <ChevronRight
          aria-hidden
          className={cn(
            'h-4 w-4 shrink-0 text-muted-foreground motion-safe:transition-transform',
            expandable && expanded && 'rotate-90',
          )}
        />
      )}
    </Comp>
  );
}