import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { BAND_LABELS, BAND_ORDER, type HeatmapRow } from '@/lib/annualReview/bellCurve';

function cellClass(compliance: string, count: number): string {
  if (count === 0) return 'bg-muted/40 text-muted-foreground';
  if (compliance === 'green') return 'bg-emerald-500/25 text-emerald-900 dark:text-emerald-100';
  if (compliance === 'amber') return 'bg-amber-500/30 text-amber-900 dark:text-amber-100';
  return 'bg-rose-500/30 text-rose-900 dark:text-rose-100';
}

export function RatingHeatmap({
  rows, title, onSelect, selectedId,
}: { rows: HeatmapRow[]; title: string; onSelect?: (id: string) => void; selectedId?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Heat Map</CardTitle>
        <CardDescription>{title} vs rating distribution — colour shows deviation from target</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data for the current filters.</p>
        ) : (
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr>
                <th className="p-2 text-left font-medium text-muted-foreground">{title}</th>
                {BAND_ORDER.map((b) => (
                  <th key={b} className="p-2 text-center font-medium text-muted-foreground text-xs">
                    {BAND_LABELS[b]}<span className="block opacity-60">({b})</span>
                  </th>
                ))}
                <th className="p-2 text-right font-medium text-muted-foreground">Rated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className={cn('cursor-pointer', selectedId === r.id && 'ring-2 ring-primary/50')}
                  onClick={() => onSelect?.(r.id)}
                >
                  <td className="p-2 font-medium max-w-[220px] truncate" title={r.name}>{r.name}</td>
                  {r.cells.map((c) => (
                    <td key={c.band} className="p-1">
                      <div
                        className={cn('rounded-md py-2 text-center tabular-nums min-h-[44px] flex flex-col justify-center', cellClass(c.compliance, c.count))}
                        title={`${c.count} employees — ${c.pct}% (variance ${c.variancePct}%)`}
                      >
                        <span className="font-semibold">{c.count}</span>
                        <span className="text-[10px] opacity-70">{c.pct}%</span>
                      </div>
                    </td>
                  ))}
                  <td className="p-2 text-right tabular-nums">{r.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-4 border-t pt-3 text-xs text-muted-foreground">
          <span>Legend:</span>
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-emerald-500/25" /> Within threshold</span>
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-amber-500/30" /> Minor deviation</span>
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-rose-500/30" /> Major deviation</span>
        </div>
      </CardContent>
    </Card>
  );
}