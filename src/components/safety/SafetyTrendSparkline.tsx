import { useMemo } from 'react';

/**
 * SafetyTrendSparkline
 * --------------------
 * Tiny pure-SVG bar chart of incident counts per day (last N days). No chart
 * lib dependency. Dashboard Phase 3 widget.
 */
export interface SafetyTrendPoint {
  date: string;   // YYYY-MM-DD
  count: number;
}

export function SafetyTrendSparkline({
  data,
  height = 56,
  ariaLabel = 'Incidents trend',
}: {
  data: SafetyTrendPoint[];
  height?: number;
  ariaLabel?: string;
}) {
  const { bars, max, total } = useMemo(() => {
    const max = data.reduce((m, d) => Math.max(m, d.count), 0);
    const total = data.reduce((s, d) => s + d.count, 0);
    return { bars: data, max, total };
  }, [data]);

  if (!bars.length) {
    return (
      <div className="text-xs text-muted-foreground py-4 text-center">No data</div>
    );
  }

  const w = 100; // viewBox width units; scales to container via preserveAspectRatio=none
  const gap = 0.3;
  const barW = (w - gap * (bars.length - 1)) / bars.length;

  return (
    <div className="w-full" aria-label={ariaLabel} role="img">
      <svg
        viewBox={`0 0 ${w} 24`}
        width="100%"
        height={height}
        preserveAspectRatio="none"
        className="overflow-visible"
      >
        {bars.map((b, i) => {
          const h = max === 0 ? 0 : (b.count / max) * 22;
          return (
            <rect
              key={b.date}
              x={i * (barW + gap)}
              y={24 - h}
              width={barW}
              height={Math.max(h, b.count > 0 ? 0.5 : 0)}
              className="fill-primary"
              opacity={b.count === 0 ? 0.15 : 0.85}
            >
              <title>{`${b.date}: ${b.count}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-1">
        <span>{bars[0]?.date.slice(5)}</span>
        <span className="tabular-nums">Total {total} · Peak {max}</span>
        <span>{bars[bars.length - 1]?.date.slice(5)}</span>
      </div>
    </div>
  );
}