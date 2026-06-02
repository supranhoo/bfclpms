import { Navigate, useParams, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getRouteFromReportId } from '@/lib/reports/catalog';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * /r/:reportId — resolves a stable Report ID to its canonical route and
 * redirects, preserving the original query string. Falls back to the TS
 * catalog when the DB lookup hasn't been seeded yet. Returns a 404-style
 * notice when the ID is unknown.
 */
export default function ReportShortlink() {
  const { reportId } = useParams<{ reportId: string }>();
  const location = useLocation();
  const [route, setRoute] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    async function resolve() {
      if (!reportId) { setRoute(null); return; }
      const local = getRouteFromReportId(reportId);
      if (local) { if (!cancelled) setRoute(local); return; }
      const { data } = await supabase
        .from('report_registry' as any)
        .select('canonical_route')
        .eq('report_id', reportId)
        .maybeSingle();
      if (cancelled) return;
      setRoute((data as any)?.canonical_route ?? null);
    }
    resolve();
    return () => { cancelled = true; };
  }, [reportId]);

  if (route === undefined) {
    return <div className="p-6"><Skeleton className="h-8 w-64" /></div>;
  }
  if (route === null) {
    return (
      <div className="p-6 max-w-md mx-auto text-center space-y-2">
        <h1 className="text-lg font-semibold">Unknown report</h1>
        <p className="text-sm text-muted-foreground">
          No report is registered for ID <code>{reportId}</code>.
        </p>
      </div>
    );
  }
  // Preserve query + add `rpt` qualifier so the page can self-identify.
  const qs = new URLSearchParams(location.search);
  if (reportId) qs.set('rpt', reportId);
  return <Navigate to={`${route}?${qs.toString()}`} replace />;
}