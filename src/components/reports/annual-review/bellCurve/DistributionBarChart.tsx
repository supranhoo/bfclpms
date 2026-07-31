import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList } from 'recharts';
import type { BandRow } from '@/lib/annualReview/bellCurve';

export function DistributionBarChart({ bands }: { bands: BandRow[] }) {
  const data = bands.map((b) => ({
    name: b.label,
    short: `${b.label.split(' ')[0]} (${b.band})`,
    Actual: b.count,
    Target: b.targetCount,
    actualPct: b.actualPct,
  }));
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Distribution Bar Chart</CardTitle>
        <CardDescription>Actual vs target employee count per rating</CardDescription>
      </CardHeader>
      <CardContent className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 16, right: 12, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="short" tick={{ fontSize: 10 }} interval={0} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--background))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="Actual" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]}>
              <LabelList dataKey="actualPct" position="top" formatter={(v: number) => `${v}%`} className="fill-muted-foreground" style={{ fontSize: 10 }} />
            </Bar>
            <Bar dataKey="Target" fill="hsl(var(--muted-foreground))" fillOpacity={0.45} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}