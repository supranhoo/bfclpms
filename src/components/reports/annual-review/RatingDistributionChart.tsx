import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList } from 'recharts';
import type { ComprehensiveRow } from '@/services/annualReview/comprehensiveReport';
import { ratingDistribution } from '@/services/annualReview/comprehensiveReport';

export function RatingDistributionChart({ rows }: { rows: ComprehensiveRow[] }) {
  const data = ratingDistribution(rows);
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">Rating distribution</CardTitle></CardHeader>
      <CardContent className="h-64">
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No rated employees yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 24, right: 40, top: 8, bottom: 8 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="rating" width={120} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v: number, _n, p) => [`${v} (${(p.payload as any).pct}%)`, 'Count']} />
              <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]}>
                <LabelList dataKey="count" position="right" className="fill-foreground" style={{ fontSize: 12 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}