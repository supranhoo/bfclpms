import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { TrendingUp } from 'lucide-react';

interface RatingBand {
  name: string;
  value: number;
  color: string;
}

interface RatingBellCurveProps {
  data: RatingBand[];
  meanScore: number;
  stdDev: number;
}

const SHORT_LABELS: Record<string, string> = {
  'Below Expectations (<3)': 'Below',
  'Needs Improvement (3.5–3)': 'Needs Imp.',
  'Meets Expectations (4–3.5)': 'Meets',
  'Exceeds Expectations (4.5–4)': 'Exceeds',
  'Outstanding (5–4.5)': 'Outstanding',
};

// Order bands left-to-right: lowest to highest
const BAND_ORDER = [
  'Outstanding (5–4.5)',
  'Exceeds Expectations (4.5–4)',
  'Meets Expectations (4–3.5)',
  'Needs Improvement (3.5–3)',
  'Below Expectations (<3)',
];

// Map band name to x-axis midpoint for reference line positioning
const BAND_MIDPOINTS: Record<string, number> = {
  'Outstanding (5–4.5)': 0,
  'Exceeds Expectations (4.5–4)': 1,
  'Meets Expectations (4–3.5)': 2,
  'Needs Improvement (3.5–3)': 3,
  'Below Expectations (<3)': 4,
};

function getMeanBandIndex(meanScore: number): number {
  if (meanScore >= 4.5) return 0;
  if (meanScore >= 4) return 1;
  if (meanScore >= 3.5) return 2;
  if (meanScore >= 3) return 3;
  return 4;
}

export function RatingBellCurve({ data, meanScore, stdDev }: RatingBellCurveProps) {
  // Sort data in band order (low to high)
  const sortedData = BAND_ORDER.map(bandName => {
    const found = data.find(d => d.name === bandName);
    return {
      name: bandName,
      shortName: SHORT_LABELS[bandName] || bandName,
      value: found?.value || 0,
      color: found?.color || '#6B7280',
    };
  });

  const meanIndex = getMeanBandIndex(meanScore);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Rating Distribution (Bell Curve)
        </CardTitle>
        <CardDescription>
          Mean: {meanScore.toFixed(2)} &nbsp;|&nbsp; Std Dev: {stdDev.toFixed(2)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sortedData} layout="vertical" margin={{ top: 10, right: 20, bottom: 5, left: 80 }}>
              <defs>
                <linearGradient id="bellCurveGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={sortedData[0]?.color} stopOpacity={0.8} />
                  <stop offset="25%" stopColor={sortedData[1]?.color} stopOpacity={0.8} />
                  <stop offset="50%" stopColor={sortedData[2]?.color} stopOpacity={0.8} />
                  <stop offset="75%" stopColor={sortedData[3]?.color} stopOpacity={0.8} />
                  <stop offset="100%" stopColor={sortedData[4]?.color} stopOpacity={0.8} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                type="number"
                allowDecimals={false}
                tick={{ fontSize: 11 }}
              />
              <YAxis
                dataKey="shortName"
                type="category"
                tick={{ fontSize: 11 }}
                width={75}
              />
              <Tooltip
                formatter={(value: number) => [value, 'Employees']}
                contentStyle={{
                  backgroundColor: 'hsl(var(--background))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
                labelFormatter={(label) => label}
              />
              <ReferenceLine
                y={sortedData[meanIndex]?.shortName}
                stroke="hsl(var(--foreground))"
                strokeDasharray="5 5"
                strokeWidth={2}
                label={{
                  value: `Mean: ${meanScore.toFixed(1)}`,
                  position: 'right',
                  fontSize: 11,
                  fill: 'hsl(var(--foreground))',
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#bellCurveGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2 mt-4">
          {sortedData.map((item) => (
            <div key={item.name} className="flex items-center gap-2 text-sm">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="text-muted-foreground">{SHORT_LABELS[item.name] || item.name}:</span>
              <span className="font-medium">{item.value}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
