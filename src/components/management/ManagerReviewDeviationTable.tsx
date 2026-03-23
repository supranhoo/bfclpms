import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { GitCompareArrows } from 'lucide-react';

interface ManagerDevStat {
  managerId: string;
  managerName: string;
  avgMgrPct: number;
  hrPmsDeviation: number | null;
  auditorDeviation: number | null;
  kpiCount: number;
}

interface ManagerReviewDeviationTableProps {
  data: ManagerDevStat[];
}

function DeviationBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground text-xs">—</span>;
  const isHigh = Math.abs(value) > 10;
  return (
    <Badge
      variant={isHigh ? 'destructive' : 'secondary'}
      className="font-mono"
    >
      {value > 0 ? '+' : ''}{value.toFixed(1)}%
    </Badge>
  );
}

export function ManagerReviewDeviationTable({ data }: ManagerReviewDeviationTableProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <GitCompareArrows className="h-5 w-5" />
          Manager vs. Reviewer Deviation
        </CardTitle>
        <CardDescription>
          How manager scores compare to HR PMS &amp; Auditor ratings on the same KPIs
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No comparable reviewer data available</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Manager</TableHead>
                  <TableHead className="text-right">Avg Mgr</TableHead>
                  <TableHead className="text-right">vs HR PMS</TableHead>
                  <TableHead className="text-right">vs Auditor</TableHead>
                  <TableHead className="text-right"># KPIs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((r) => (
                  <TableRow key={r.managerId}>
                    <TableCell className="font-medium">{r.managerName}</TableCell>
                    <TableCell className="text-right">{r.avgMgrPct.toFixed(1)}%</TableCell>
                    <TableCell className="text-right">
                      <DeviationBadge value={r.hrPmsDeviation} />
                    </TableCell>
                    <TableCell className="text-right">
                      <DeviationBadge value={r.auditorDeviation} />
                    </TableCell>
                    <TableCell className="text-right">{r.kpiCount}</TableCell>
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
