/**
 * ADR-279 — scope stat band for the Performance Console.
 * Derives its numbers from the already-loaded tree (one memoised reduce in the
 * caller); it never fetches. Also exposes a muted placeholder shell so the page
 * keeps its structure before a scope is loaded.
 *
 * ADR-283 — the loaded state renders as a single-line strip so the console's
 * chrome stays inside its vertical budget. The tile grid is kept for the
 * pre-scope placeholder, where the page has room to spare.
 */
import type { ReactNode } from 'react';
import { Layers, ListTree, Target, Users, Gauge } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScorePill } from './ScorePill';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export interface ConsoleStats {
  categories: number;
  kras: number;
  kpis: number;
  employees: number;
  avgScore: number | null;
}

/**
 * Aggregates the loaded tree — presentation-side only, no data change.
 *
 * ADR-281: `employeeTotal` is the DISTINCT employee count supplied by the
 * `bu_console_tree` RPC. It must never be derived by summing per-KPI
 * `employee_count`, which multiplies every employee by their KPI count.
 */
export function computeConsoleStats(
  categories: {
    kra_count: number;
    kpi_count: number;
    kras: { kpis: { employee_count: number; avg_score: number | null }[] }[];
  }[],
  employeeTotal?: number | null,
): ConsoleStats {
  let kras = 0;
  let kpis = 0;
  let scoreSum = 0;
  let scoreCount = 0;
  for (const c of categories) {
    kras += c.kra_count ?? 0;
    kpis += c.kpi_count ?? 0;
    for (const k of c.kras ?? []) {
      for (const kpi of k.kpis ?? []) {
        if (kpi.avg_score !== null && kpi.avg_score !== undefined) {
          scoreSum += Number(kpi.avg_score);
          scoreCount += 1;
        }
      }
    }
  }
  return {
    categories: categories.length,
    kras,
    kpis,
    employees: employeeTotal ?? 0,
    avgScore: scoreCount > 0 ? scoreSum / scoreCount : null,
  };
}

function Tile({
  icon,
  label,
  value,
  context,
  muted,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  context?: string;
  muted?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-start gap-3 px-4 py-3">
      <span
        className={cn(
          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
          muted ? 'bg-muted text-muted-foreground/60' : 'bg-primary/10 text-primary',
        )}
        aria-hidden
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <div
          className={cn(
            'text-xl font-semibold tabular-nums leading-tight',
            muted && 'text-muted-foreground/50',
          )}
        >
          {value}
        </div>
        {context && <p className="truncate text-[11px] text-muted-foreground">{context}</p>}
      </div>
    </div>
  );
}

export function ConsoleStatBand({
  stats,
  scopeLabel,
  placeholder,
  variant = 'strip',
}: {
  stats?: ConsoleStats;
  scopeLabel?: string;
  /** Render the muted structural shell used before a scope is loaded. */
  placeholder?: boolean;
  /** `strip` = one dense line (default). `tiles` = the roomy 5-tile grid. */
  variant?: 'strip' | 'tiles';
}) {
  const s = stats ?? { categories: 0, kras: 0, kpis: 0, employees: 0, avgScore: null };
  const dash = placeholder ? '—' : undefined;

  if (variant === 'strip' && !placeholder) {
    return (
      <TooltipProvider>
        <section
          aria-label="Loaded scope summary"
          className="flex snap-x items-center gap-x-4 gap-y-1 overflow-x-auto text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <Chip icon={<Layers className="h-3.5 w-3.5" />} label="Categories" value={s.categories} />
          <Chip icon={<ListTree className="h-3.5 w-3.5" />} label="KRAs" value={s.kras} />
          <Chip icon={<Target className="h-3.5 w-3.5" />} label="KPIs" value={s.kpis} />
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="shrink-0 snap-start">
                <Chip
                  icon={<Users className="h-3.5 w-3.5" />}
                  label="Employees"
                  value={s.employees}
                />
              </span>
            </TooltipTrigger>
            <TooltipContent>Distinct employees in scope</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex shrink-0 snap-start items-center gap-1.5">
                <Gauge className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Avg score
                </span>
                <ScorePill value={s.avgScore} />
              </span>
            </TooltipTrigger>
            <TooltipContent>Average across scored KPIs</TooltipContent>
          </Tooltip>
          {scopeLabel && (
            <span className="ml-auto hidden shrink-0 truncate pl-2 text-xs text-muted-foreground lg:block">
              {scopeLabel}
            </span>
          )}
        </section>
      </TooltipProvider>
    );
  }

  return (
    <section
      aria-label="Loaded scope summary"
      className="grid grid-cols-2 divide-x divide-y rounded-lg border bg-card sm:grid-cols-3 sm:divide-y-0 xl:grid-cols-5"
    >
      <Tile
        icon={<Layers className="h-4 w-4" />}
        label="Categories"
        value={dash ?? s.categories}
        context={scopeLabel}
        muted={placeholder}
      />
      <Tile
        icon={<ListTree className="h-4 w-4" />}
        label="KRAs"
        value={dash ?? s.kras}
        muted={placeholder}
      />
      <Tile
        icon={<Target className="h-4 w-4" />}
        label="KPIs"
        value={dash ?? s.kpis}
        muted={placeholder}
      />
      <Tile
        icon={<Users className="h-4 w-4" />}
        label="Employees impacted"
        value={dash ?? s.employees}
        context={placeholder ? undefined : 'distinct employees in scope'}
        muted={placeholder}
      />
      <Tile
        icon={<Gauge className="h-4 w-4" />}
        label="Average score"
        value={placeholder ? '—' : <ScorePill value={s.avgScore} />}
        context={placeholder ? undefined : 'across scored KPIs'}
        muted={placeholder}
      />
    </section>
  );
}