import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Scale } from 'lucide-react';

interface ReviewerStat {
  managerId: string;
  managerName: string;
  avgScoreGiven: number;
  deviation: number;
  reviewCount: number;
}

interface ReviewerAnalyticsTableProps {
  data: ReviewerStat[];
  orgMean: number;
}

export function ReviewerAnalyticsTable({ data, orgMean }: ReviewerAnalyticsTableProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Scale className="h-5 w-5" />
          Reviewer Analytics — Score Bias
        </CardTitle>
        <CardDescription>
          Manager scoring deviation from org mean ({orgMean.toFixed(1)}%)
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No reviewer data available</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Manager</TableHead>
                  <TableHead className="text-right">Avg Given</TableHead>
                  <TableHead className="text-right">Deviation</TableHead>
                  <TableHead className="text-right"># Reviews</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((r) => (
                  <TableRow key={r.managerId}>
                    <TableCell className="font-medium">{r.managerName}</TableCell>
                    <TableCell className="text-right">{r.avgScoreGiven.toFixed(1)}%</TableCell>
                    <TableCell className="text-right">
                      <Badge
                        variant={Math.abs(r.deviation) > 10 ? 'destructive' : 'secondary'}
                        className="font-mono"
                      >
                        {r.deviation > 0 ? '+' : ''}{r.deviation.toFixed(1)}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{r.reviewCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
