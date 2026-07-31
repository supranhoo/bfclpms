import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ComplianceChip } from './ComplianceChip';
import type { BandRow } from '@/lib/annualReview/bellCurve';

export function VarianceTable({ bands }: { bands: BandRow[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Variance Analysis</CardTitle>
        <CardDescription>Actual vs target distribution per rating band</CardDescription>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rating</TableHead>
              <TableHead className="text-right">Count</TableHead>
              <TableHead className="text-right">Actual %</TableHead>
              <TableHead className="text-right">Target %</TableHead>
              <TableHead className="text-right">Variance %</TableHead>
              <TableHead>Compliance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...bands].reverse().map((b) => (
              <TableRow key={b.band}>
                <TableCell className="font-medium">{b.label} ({b.band})</TableCell>
                <TableCell className="text-right tabular-nums">{b.count}</TableCell>
                <TableCell className="text-right tabular-nums">{b.actualPct}%</TableCell>
                <TableCell className="text-right tabular-nums">{b.targetPct}%</TableCell>
                <TableCell className="text-right tabular-nums">{b.variancePct > 0 ? `+${b.variancePct}` : b.variancePct}%</TableCell>
                <TableCell><ComplianceChip level={b.compliance} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}