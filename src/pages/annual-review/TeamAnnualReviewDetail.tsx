import { useMemo } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import { useActiveCycle, useReviewInstance } from '@/hooks/useAnnualReview';
import { TeamReviewDetailContent } from '@/components/annual-review/TeamReviewDetailContent';
import { fyStartFromCycle } from '@/lib/annualReview/fiscalYear';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

type LocState = { siblings?: string[]; returnTo?: string } | null;

/**
 * Dedicated detail page for a single reviewee, mounted at
 * `/annual-review/team/:instanceId`. Split from the queue page so each surface
 * has its own URL, scroll context, and Suspense boundary.
 */
export default function TeamAnnualReviewDetail() {
  const { instanceId } = useParams<{ instanceId: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocState;

  const { data: cycle } = useActiveCycle();
  const { data: instance, isLoading, error } = useReviewInstance(instanceId);

  const autoAssisted = params.get('assisted') === '1';
  const returnTo = state?.returnTo ?? '/annual-review/team';
  const siblings = state?.siblings ?? [];
  const idx = instanceId ? siblings.indexOf(instanceId) : -1;
  const prevId = idx > 0 ? siblings[idx - 1] : null;
  const nextId = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;

  const goSibling = (id: string) =>
    navigate(`/annual-review/team/${id}${autoAssisted ? '?assisted=1' : ''}`, {
      state: { siblings, returnTo },
      replace: true,
    });

  const header = useMemo(() => (
    <header className="sticky top-0 z-10 -mx-4 md:-mx-6 px-4 md:px-6 py-3 mb-4 bg-background/85 backdrop-blur border-b flex items-center justify-between gap-3">
      <Button variant="ghost" size="sm" onClick={() => navigate(returnTo)} className="gap-1.5">
        <ArrowLeft className="h-4 w-4" /> Back to queue
      </Button>
      <div className="flex items-center gap-1">
        <Button
          variant="outline" size="sm" className="h-8 px-2"
          disabled={!prevId}
          onClick={() => prevId && goSibling(prevId)}
          aria-label="Previous reviewee"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        {siblings.length > 0 && idx >= 0 && (
          <span className="text-xs text-muted-foreground tabular-nums px-2">
            {idx + 1} / {siblings.length}
          </span>
        )}
        <Button
          variant="outline" size="sm" className="h-8 px-2"
          disabled={!nextId}
          onClick={() => nextId && goSibling(nextId)}
          aria-label="Next reviewee"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </header>
  ), [navigate, returnTo, prevId, nextId, siblings, idx]);

  if (!cycle) return <div className="p-6">No active annual review cycle.</div>;

  if (isLoading && !instance) {
    return (
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        {header}
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading review…</div>
      </div>
    );
  }

  if (error || !instance) {
    return (
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        {header}
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            <p className="mb-2">This review isn't available — it may have moved to another stage, or you no longer have access.</p>
            <Button asChild variant="link" className="px-0"><Link to={returnTo}>Return to queue</Link></Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      {header}
      <TeamReviewDetailContent
        instance={instance}
        fiscalYear={fyStartFromCycle(cycle)}
        autoOpenAssisted={autoAssisted}
      />
    </div>
  );
}