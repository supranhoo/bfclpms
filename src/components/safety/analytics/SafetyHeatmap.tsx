/**
 * Phase 10 — Safety Analytics v2: color-coded BU heatmap
 * ------------------------------------------------------
 * Renders a compact matrix of (business unit × metric) cells with
 * intensity-shaded backgrounds. Intensity is calculated by
 * `heatmapIntensity()` from the SSOT helpers — components stay dumb.
 */
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Flame } from 'lucide-react';
import { heatmapIntensity, type SafetyAnalyticsPayload } from '@/lib/safetyAnalytics';

interface Props {
  payload: SafetyAnalyticsPayload;
}

type Row = {
  buId: string | null;
  critical: number;
  high: number;
  open: number;
  recordable: number;
};

const METRICS: Array<{ key: keyof Omit<Row, 'buId'>; label: string; tone: 'destructive' | 'amber' }> = [
  { key: 'critical',   label: 'Critical', tone: 'destructive' },
  { key: 'high',       label: 'High',     tone: 'destructive' },
  { key: 'open',       label: 'Open',     tone: 'amber' },
  { key: 'recordable', label: 'Recordable', tone: 'destructive' },
];

export function SafetyHeatmap({ payload }: Props) {
  // Build dense per-BU rows from existing MVs (no new fetch).
  const buIds = Array.from(
    new Set([
      ...payload.severity.map((r) => r.business_unit_id),
      ...payload.open_vs_closed.map((r) => r.business_unit_id),
      ...payload.trir.map((r) => r.business_unit_id),
    ]),
  );

  const rows: Row[] = buIds.map((buId) => {
    const sev = payload.severity.find((r) => r.business_unit_id === buId);
    const oc  = payload.open_vs_closed.find((r) => r.business_unit_id === buId);
    const tr  = payload.trir.find((r) => r.business_unit_id === buId);
    return {
      buId,
      critical:   sev?.critical_count ?? 0,
      high:       sev?.high_count ?? 0,
      open:       oc?.open_count ?? 0,
      recordable: tr?.recordable_cases ?? 0,
    };
  });

  // Per-column max for normalisation.
  const maxes: Record<keyof Omit<Row, 'buId'>, number> = {
    critical:   Math.max(0, ...rows.map((r) => r.critical)),
    high:       Math.max(0, ...rows.map((r) => r.high)),
    open:       Math.max(0, ...rows.map((r) => r.open)),
    recordable: Math.max(0, ...rows.map((r) => r.recordable)),
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Flame className="h-4 w-4" /> Risk Heatmap by Business Unit
        </CardTitle>
        <CardDescription>
          Cell intensity normalised per metric column (12-month window).
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No business-unit incident data yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  <th className="py-2 pr-3">BU</th>
                  {METRICS.map((m) => (
                    <th key={m.key} className="py-2 px-2 text-center">{m.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.buId ?? 'na'} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-mono text-xs">
                      {row.buId?.slice(0, 8) ?? '(unassigned)'}
                    </td>
                    {METRICS.map((m) => {
                      const val = row[m.key];
                      const intensity = heatmapIntensity(val, maxes[m.key]);
                      const tokenVar = m.tone === 'destructive' ? '--destructive' : '--primary';
                      const style = {
                        backgroundColor: intensity > 0
                          ? `hsl(var(${tokenVar}) / ${0.12 + intensity * 0.55})`
                          : 'transparent',
                      };
                      return (
                        <td key={m.key} className="px-1 py-1">
                          <div
                            className="text-center rounded-md py-1.5 tabular-nums font-medium"
                            style={style}
                            title={`${m.label}: ${val}`}
                          >
                            {val}
                          </div>
                        </td>
                      );
                    })}
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