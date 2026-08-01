/**
 * ADR-218f — side-by-side reviewer matrix for the read-only review form viewer.
 *
 * One column per reviewer stage (Self / Manager / Dept Head / BU Head / HR /
 * Management), one row per criterion, so an analyst can compare ratings across
 * the whole chain without scrolling between stacked cards.
 *
 * Presentation only — all pivoting lives in `buildStageMatrix`.
 */
import { MessageSquareText } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import type { StageMatrix } from '@/lib/annualReview/reviewFormView';

const fmt = (v: number | null | undefined, d = 2) =>
  typeof v === 'number' && Number.isFinite(v) ? v.toFixed(d) : '—';
const fmtDate = (v: string | null) =>
  v ? new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : null;

export function StageComparisonTable({ matrix }: { matrix: StageMatrix }) {
  const { stages, rows } = matrix;
  if (stages.length === 0) {
    return <p className="text-sm text-muted-foreground">No reviewer stages recorded.</p>;
  }

  const remarks = rows.flatMap((r) =>
    r.cells
      .map((c, i) => (c.comment ? { criterion: r.name, stage: stages[i].label, text: c.comment } : null))
      .filter(Boolean) as { criterion: string; stage: string; text: string }[],
  );

  return (
    <TooltipProvider delayDuration={150}>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="sticky left-0 z-10 min-w-[220px] bg-muted/50 p-2 text-left font-medium align-bottom">
                Criterion
              </th>
              {stages.map((s) => (
                <th key={s.role} className="min-w-[120px] p-2 text-right font-medium align-bottom">
                  <span className="block text-foreground">{s.label}</span>
                  <span className="block font-normal">{s.reviewerName ?? '—'}</span>
                  <span className="block font-normal">
                    {s.submitted ? fmtDate(s.submittedAt) : 'Not submitted'}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t hover:bg-muted/50">
                <td className="sticky left-0 z-10 bg-background p-2">{r.name}</td>
                {r.cells.map((c, i) => (
                  <td key={stages[i].role} className="p-2 text-right tabular-nums">
                    <span className="inline-flex items-center justify-end gap-1">
                      {fmt(c.score)}
                      {c.comment && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button type="button" className="text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring rounded">
                              <MessageSquareText className="h-3.5 w-3.5" aria-hidden="true" />
                              <span className="sr-only">{`Remark from ${stages[i].label}: ${c.comment}`}</span>
                            </button>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs whitespace-pre-wrap">{c.comment}</TooltipContent>
                        </Tooltip>
                      )}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t bg-muted/30 text-xs">
            <tr>
              <td className="sticky left-0 z-10 bg-muted/30 p-2 font-medium">Stage score</td>
              {stages.map((s) => (
                <td key={s.role} className="p-2 text-right font-medium tabular-nums">{fmt(s.weightedScore)}</td>
              ))}
            </tr>
            <tr className="border-t">
              <td className="sticky left-0 z-10 bg-muted/30 p-2 font-medium align-top">Overall remark</td>
              {stages.map((s) => (
                <td key={s.role} className="p-2 text-left align-top whitespace-pre-wrap text-muted-foreground">
                  {s.notes ?? '—'}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      {remarks.length > 0 && (
        <Collapsible className="mt-3">
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm">Criterion remarks ({remarks.length})</Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 space-y-2">
            {remarks.map((r, i) => (
              <div key={`${r.criterion}-${r.stage}-${i}`} className="rounded-md border p-2">
                <p className="text-xs text-muted-foreground">{r.stage} · {r.criterion}</p>
                <p className="whitespace-pre-wrap text-sm">{r.text}</p>
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}
    </TooltipProvider>
  );
}
