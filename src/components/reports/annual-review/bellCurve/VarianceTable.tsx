import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ComplianceChip } from './ComplianceChip';
import type { DistRow } from '@/lib/annualReview/bellCurve';

/**
 * ADR-218 / ADR-218b — distribution table. Target, variance and compliance
 * columns only render for band modes that define targets (rating bands).
 */
export function VarianceTable({
  bands, hasTargets = true, bandTitle = 'Rating',
}: { bands: DistRow[]; hasTargets?: boolean; bandTitle?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{hasTargets ? 'Variance Analysis' : 'Distribution'}</CardTitle>
        <CardDescription>
          {hasTargets
            ? 'Actual vs target distribution per rating band'
            : 'Employee distribution per increment slab — no targets are defined for slabs'}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{bandTitle}</TableHead>
              <TableHead className="text-right">Count</TableHead>
              {hasTargets && <TableHead className="text-right">Target %</TableHead>}
              <TableHead className="text-right">Actual %</TableHead>
              {hasTargets && <TableHead className="text-right">Variance %</TableHead>}
              {hasTargets && <TableHead>Compliance</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...bands].reverse().map((b) => (
              <TableRow key={b.key}>
                <TableCell className="font-medium">{b.label} {b.sub}</TableCell>
                <TableCell className="text-right tabular-nums">{b.count}</TableCell>
                {hasTargets && <TableCell className="text-right tabular-nums">{b.targetPct}%</TableCell>}
                <TableCell className="text-right tabular-nums">{b.actualPct}%</TableCell>
                {hasTargets && (
                  <TableCell className="text-right tabular-nums">
                    {(b.variancePct ?? 0) > 0 ? `+${b.variancePct}` : b.variancePct}%
                  </TableCell>
                )}
                {hasTargets && <TableCell><ComplianceChip level={b.compliance ?? 'green'} /></TableCell>}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
