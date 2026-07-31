import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { BAND_LABELS, BAND_ORDER, targetCurvePoints, type BandRow, type BellCurveConfig } from '@/lib/annualReview/bellCurve';

/** Linear interpolation of the actual band counts so the actual series reads as a curve. */
function actualAt(x: number, bands: BandRow[]): number {
  const lo = Math.max(1, Math.min(4, Math.floor(x)));
  const hi = lo + 1;
  const a = bands.find((b) => b.band === lo)?.count ?? 0;
  const b = bands.find((b2) => b2.band === hi)?.count ?? 0;
  const t = Math.min(1, Math.max(0, x - lo));
  return Math.round((a + (b - a) * t) * 100) / 100;
}

export function BellCurveChart({
  bands, config, denom,
}: { bands: BandRow[]; config: BellCurveConfig; denom: number }) {
  const curve = targetCurvePoints(config, denom);
  const data = curve.map((p) => ({
    x: p.x,
    target: p.y,
    actual: actualAt(p.x, bands),
  }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Bell Curve</CardTitle>
        <CardDescription>Target normal distribution vs actual employee distribution</CardDescription>
      </CardHeader>
      <CardContent className="h-[320px]">
        {denom === 0 ? (
          <p className="text-sm text-muted-foreground">No rated employees for the current filters.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 10, right: 16, bottom: 24, left: 4 }}>
              <defs>
                <linearGradient id="bcActual" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="x"
                type="number"
                domain={[1, 5]}
                ticks={BAND_ORDER as unknown as number[]}
                tickFormatter={(v: number) => `${BAND_LABELS[v as 1]} (${v})`}
                tick={{ fontSize: 10 }}
                interval={0}
                height={40}
              />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} label={{ value: 'Employee Count', angle: -90, position: 'insideLeft', fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--background))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v: number, name: string) => [Math.round(Number(v) * 10) / 10, name === 'actual' ? 'Actual' : 'Target']}
                labelFormatter={(v: number) => `Rating ${v}`}
              />
              <Legend formatter={(v) => (v === 'actual' ? 'Actual Distribution' : 'Target Distribution')} wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="actual" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#bcActual)" dot={false} />
              <Line type="monotone" dataKey="target" stroke="hsl(var(--muted-foreground))" strokeWidth={2} strokeDasharray="6 4" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}