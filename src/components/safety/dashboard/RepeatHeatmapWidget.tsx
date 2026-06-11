import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Repeat, Loader2 } from 'lucide-react';
import { useSafetyRecurrence } from '@/hooks/useSafetyAnalytics';

/**
 * RepeatHeatmapWidget
 * -------------------
 * Location × incident-type recurrence (≥2 occurrences in the trailing 12
 * months). Reads `safety_analytics_recurrence` RPC.
 */
export default function RepeatHeatmapWidget() {
  const { data = [], isLoading } = useSafetyRecurrence();

  const { locations, types, matrix, max } = useMemo(() => {
    const locs = Array.from(new Set(data.map((r) => r.location_label))).sort();
    const typs = Array.from(new Set(data.map((r) => r.incident_type))).sort();
    const m = new Map<string, Map<string, number>>();
    for (const r of data) {
      if (!m.has(r.location_label)) m.set(r.location_label, new Map());
      m.get(r.location_label)!.set(r.incident_type, r.occurrences);
    }
    const mat = locs.map((l) => typs.map((t) => m.get(l)?.get(t) ?? 0));
    return { locations: locs, types: typs, matrix: mat, max: Math.max(1, ...mat.flat()) };
  }, [data]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Repeat className="h-4 w-4" /> Repeat incident heatmap
        </CardTitle>
        <CardDescription>Locations with repeat incidents in the last 12 months.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center py-6 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
          </div>
        ) : locations.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No repeat incidents — every location is unique.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-separate border-spacing-1">
              <thead>
                <tr>
                  <th className="text-left text-muted-foreground font-normal pr-2">Location</th>
                  {types.map((t) => (
                    <th key={t} className="text-muted-foreground font-normal text-center capitalize">
                      {t.replace(/_/g, ' ')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {locations.map((loc, i) => (
                  <tr key={loc}>
                    <td className="pr-2 truncate max-w-[200px]">{loc}</td>
                    {matrix[i].map((v, j) => (
                      <td key={j} className="text-center">
                        <div
                          className={`h-7 min-w-[28px] rounded flex items-center justify-center tabular-nums font-medium ${v === 0 ? 'bg-muted' : 'bg-amber-500'}`}
                          style={v > 0 ? { opacity: 0.25 + (v / max) * 0.75, color: 'white' } : undefined}
                          title={`${v} ${types[j]} incidents at ${loc}`}
                        >
                          {v || ''}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}