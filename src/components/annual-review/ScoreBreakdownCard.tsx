/**
 * ADR-174 / POLICY §AR-KRA-RATING-VISIBILITY.
 *
 * "How your score was calculated" — a collapsible, read-only explanation of
 * every scoring parameter behind an annual-review result, so an employee can
 * re-add the arithmetic by hand. Presentation only; all maths comes from
 * `buildScoreParameters` (SSOT shared with the report export).
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { ChevronDown, Calculator } from 'lucide-react';
import type { AnnualReviewTemplate } from '@/types/annualReview';
import { buildScoreParameters } from '@/lib/annualReview/scoreParameters';

const fmt = (v: number | null | undefined, digits = 2) =>
  typeof v === 'number' && Number.isFinite(v) ? v.toFixed(digits) : '—';

export function ScoreBreakdownCard({
  template, criteriaScores, systemScores, defaultOpen = false,
}: {
  template: AnnualReviewTemplate | null | undefined;
  criteriaScores: Record<string, number> | null | undefined;
  systemScores: Record<string, number> | null | undefined;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const breakdown = buildScoreParameters(template, criteriaScores, systemScores);
  if (breakdown.rows.length === 0) return null;

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader className="pb-3">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between px-0 hover:bg-transparent">
              <span className="flex items-center gap-2">
                <Calculator className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">How your score was calculated</CardTitle>
                <Badge variant="outline">{breakdown.scoringMode}</Badge>
              </span>
              <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
            </Button>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="pt-0">
            {/* Desktop / tablet: table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left">
                    <th className="p-2 font-medium">Parameter</th>
                    <th className="p-2 font-medium">Type</th>
                    <th className="p-2 font-medium text-right">Achieved</th>
                    <th className="p-2 font-medium text-right">Out of</th>
                    <th className="p-2 font-medium text-right">Weight</th>
                    <th className="p-2 font-medium text-right">Contribution</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdown.rows.map((r) => (
                    <tr key={`${r.kind}-${r.id}`} className="border-t">
                      <td className="p-2">{r.name}</td>
                      <td className="p-2 text-muted-foreground">
                        {r.kind === 'criterion'
                          ? 'Criterion'
                          : r.source === 'carry_kra' ? 'KRA (monthly rollup)' : 'System'}
                      </td>
                      <td className="p-2 text-right tabular-nums">{fmt(r.achieved)}</td>
                      <td className="p-2 text-right tabular-nums text-muted-foreground">{fmt(r.outOf)}</td>
                      <td className="p-2 text-right tabular-nums text-muted-foreground">{fmt(r.weight)}</td>
                      <td className="p-2 text-right tabular-nums">{fmt(r.contribution)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-muted/30 font-medium">
                    <td className="p-2" colSpan={5}>Total</td>
                    <td className="p-2 text-right tabular-nums">
                      {fmt(breakdown.totalActual)} / {fmt(breakdown.totalMax)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Mobile: stacked list */}
            <div className="sm:hidden space-y-2">
              {breakdown.rows.map((r) => (
                <div key={`${r.kind}-${r.id}`} className="rounded-md border p-3 space-y-1">
                  <p className="text-sm font-medium">{r.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.kind === 'criterion'
                      ? 'Criterion'
                      : r.source === 'carry_kra' ? 'KRA (monthly rollup)' : 'System'}
                    {' · weight '}{fmt(r.weight)}
                  </p>
                  <p className="text-sm tabular-nums">
                    {fmt(r.achieved)} / {fmt(r.outOf)}
                    <span className="text-muted-foreground"> → {fmt(r.contribution)} pts</span>
                  </p>
                </div>
              ))}
              <div className="rounded-md border p-3 bg-muted/30 text-sm font-medium tabular-nums">
                Total {fmt(breakdown.totalActual)} / {fmt(breakdown.totalMax)}
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
