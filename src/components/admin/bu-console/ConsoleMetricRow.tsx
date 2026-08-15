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

interface ConsoleMetricRowProps {
  index?: number;
  title: string;
  subtitle?: ReactNode;
  metrics?: ConsoleMetric[];
  selected?: boolean;
  onClick?: () => void;
  trailing?: ReactNode;
  className?: string;
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
}: ConsoleMetricRowProps) {
  const interactive = typeof onClick === 'function';
  const Comp: any = interactive ? 'button' : 'div';
  return (
    <Comp
      type={interactive ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'flex w-full min-h-11 items-center gap-3 px-3 py-2.5 text-left',
        interactive && 'transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected && 'bg-accent',
        className,
      )}
    >
      {typeof index === 'number' && (
        <span className="hidden sm:flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-[11px] font-semibold tabular-nums text-muted-foreground">
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
        <div className="grid shrink-0 grid-cols-2 gap-x-4 gap-y-1 sm:flex sm:gap-6">
          {metrics.map(m => (
            <div key={m.label} className="min-w-[64px] text-right sm:text-left">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {m.label}
              </p>
              <p className="text-sm font-semibold tabular-nums">{m.value}</p>
            </div>
          ))}
        </div>
      )}

      {trailing}
      {interactive && !trailing && (
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      )}
    </Comp>
  );
}