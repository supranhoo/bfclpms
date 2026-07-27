import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, ShieldCheck, TriangleAlert } from 'lucide-react';
import {
  classifyFinalScoreIntegrity,
  FINAL_SCORE_ISSUE_LABEL,
  type FinalScoreIntegrityIssue,
} from '@/lib/annualReview/finalScoreScale';

type Row = {
  id: string;
  overall_status: string;
  total_score: number | null;
  final_rating: string | null;
};

const PAGE = 1000;

/**
 * ADR-187 — Final score integrity monitor.
 * Read-only counter surfacing completed reviews whose `total_score` is outside
 * the 0..100 scale or whose rating band is blank. The DB trigger
 * `trg_ar_total_score_scale` should keep this at zero; a non-zero count means a
 * write path bypassed `annual_review_compute_final_summary`.
 */
export function FinalScoreIntegrityCard() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['annual-review-final-score-integrity'],
    queryFn: async () => {
      // Paginated scan — the cycle holds thousands of instances.
      const rows: Row[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data: page, error } = await supabase
          .from('annual_review_instances')
          .select('id, overall_status, total_score, final_rating')
          .eq('overall_status', 'completed')
          .range(from, from + PAGE - 1);
        if (error) throw error;
        rows.push(...((page ?? []) as Row[]));
        if (!page || page.length < PAGE) break;
      }
      const counts: Record<Exclude<FinalScoreIntegrityIssue, null>, number> = {
        out_of_range: 0,
        missing_rating: 0,
      };
      for (const r of rows) {
        const issue = classifyFinalScoreIntegrity(r);
        if (issue) counts[issue] += 1;
      }
      return { counts, scanned: rows.length };
    },
    staleTime: 5 * 60_000,
  });

  const total = data ? data.counts.out_of_range + data.counts.missing_rating : 0;
  const clean = !!data && total === 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            {clean
              ? <ShieldCheck className="h-4 w-4 text-primary" />
              : <TriangleAlert className="h-4 w-4 text-destructive" />}
            Final score integrity
          </CardTitle>
          <CardDescription>
            Completed reviews must carry a 0–100 score and a rating band (ADR-187).
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          <span className="sr-only">Refresh</span>
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Scanning completed reviews…
          </div>
        ) : clean ? (
          <p className="text-sm text-muted-foreground">
            No drift across {data?.scanned ?? 0} completed reviews.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {(Object.keys(FINAL_SCORE_ISSUE_LABEL) as Array<Exclude<FinalScoreIntegrityIssue, null>>)
              .filter((k) => (data?.counts[k] ?? 0) > 0)
              .map((k) => (
                <Badge key={k} variant="destructive" className="whitespace-normal text-left">
                  {data?.counts[k]} · {FINAL_SCORE_ISSUE_LABEL[k]}
                </Badge>
              ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
