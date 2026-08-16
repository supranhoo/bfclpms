/**
 * ADR-279 — score presentation for the Performance Console.
 * Purely presentational: bands a score against its scale and renders a tinted
 * pill plus an optional micro bar. Never computes or rewrites a score.
 */
import { cn } from '@/lib/utils';

export type ScoreBand = 'none' | 'low' | 'mid' | 'high';

/** Bands a score against its scale (defaults to the 0..5 review scale). */
export function scoreBand(value: number | null | undefined, scale = 5): ScoreBand {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'none';
  const pct = Math.max(0, Math.min(1, Number(value) / (scale || 5)));
  if (pct < 0.5) return 'low';
  if (pct < 0.8) return 'mid';
  return 'high';
}

const BAND_PILL: Record<ScoreBand, string> = {
  none: 'border-border bg-muted text-muted-foreground',
  low: 'border-destructive/30 bg-destructive/10 text-destructive',
  mid: 'border-warning/40 bg-warning/10 text-warning',
  high: 'border-success/40 bg-success/10 text-success',
};

const BAND_BAR: Record<ScoreBand, string> = {
  none: 'bg-muted-foreground/30',
  low: 'bg-destructive',
  mid: 'bg-warning',
  high: 'bg-success',
};

interface ScorePillProps {
  value: number | null | undefined;
  scale?: number;
  /** Show the thin progress bar beneath the pill. */
  withBar?: boolean;
  className?: string;
}

export function ScorePill({ value, scale = 5, withBar, className }: ScorePillProps) {
  const band = scoreBand(value, scale);
  const pct =
    band === 'none' ? 0 : Math.max(2, Math.min(100, (Number(value) / (scale || 5)) * 100));
  const label = band === 'none' ? '—' : Number(value).toFixed(2);

  return (
    <span className={cn('inline-flex flex-col items-end gap-1', className)}>
      <span
        className={cn(
          'inline-flex min-w-[52px] items-center justify-center rounded-full border px-2 py-0.5',
          'text-xs font-semibold tabular-nums',
          BAND_PILL[band],
        )}
      >
        {label}
      </span>
      {withBar && (
        <span
          className="h-1 w-full min-w-[52px] overflow-hidden rounded-full bg-muted"
          aria-hidden
        >
          <span
            className={cn('block h-full rounded-full motion-safe:transition-all', BAND_BAR[band])}
            style={{ width: `${pct}%` }}
          />
        </span>
      )}
    </span>
  );
}